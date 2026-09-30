// SPDX-License-Identifier: Apache-2.0
// Zero-dependency build. Writes dist/, loadable with chrome://extensions → "Load unpacked".
//
// The only real work is the content script: a classic content script cannot be an ES module,
// so `tools/bundle.mjs` turns src/content, the language packs and the fillers into one script.
// The service worker *is* a module, so it keeps its imports and its files are copied as they
// are. Most of the rest of this file is validation: of the manifest, the locales, the language
// packs against the field registry, and every import in dist/.

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { bundleContent } from './tools/bundle.mjs';
import { targetFrom } from './platform/index.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
// `--dev` adds a localhost content script and a `?epimoni_autofill=1` auto-run, so a fixture
// page can be driven without a toolbar click. Never in a shipped build: it would mean filling
// forms on any local page, which the single purpose does not cover.
const DEV = process.argv.includes('--dev');
// `--target=firefox` builds for another browser into its own directory (platform/). The code
// is the same for every target; only the manifest is transformed.
const TARGET = targetFrom(process.argv);
const DIST = join(ROOT, TARGET.dist);
const read = (p) => readFile(join(ROOT, p), 'utf8');
const load = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { FIELDS, SECTIONS } = await load('src/schema/fields.js');
const { PACKS, AUTOCOMPLETE } = await load('src/lexicon/index.js');
const { FILLERS } = await load('src/fillers/index.js');

await rm(DIST, { recursive: true, force: true });
await mkdir(join(DIST, 'src'), { recursive: true });
await mkdir(join(DIST, 'icons'), { recursive: true });

// The content script: every module under src/content, the language packs and the fillers,
// through the one bundler `test/measure.mjs` also uses, so the engine that is measured is the
// engine that ships. It refuses a filler that breaks the contract (tools/bundle.mjs).
let body;
try {
  body = bundleContent(ROOT, { dev: DEV });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
await writeFile(
  join(DIST, 'content.js'),
  ['(() => {', body, await read('src/content/index.js'), '})();'].join('\n'),
);

// The worker keeps its module graph, but it moves: src/background/index.js becomes
// /background.js, so its relative imports have to be rewritten. Without this the worker
// throws on import, never registers a listener, and the extension looks installed while
// answering nothing, which is exactly how it failed the first time.
// `EPIMONI_DEV` is set on `globalThis` rather than declared: the add-on in src/epimoni reads it
// too, and a `const` here would be scoped to this one module.
await writeFile(
  join(DIST, 'background.js'),
  `globalThis.EPIMONI_DEV = ${DEV};\n` +
    (await read('src/background/index.js')).replace(/from '\.\.\/(shared|epimoni)\//g, "from './src/$1/"),
);
// Shared modules are copied as they are and imported as modules. A module that does not reach
// dist/ resolves to nothing, which a service worker reports by silently answering no message
// at all: the check at the bottom of this file is what turns that into a build failure.
// The language packs and the field registry go too: `cvdoc.js` reads month names and the
// entry fields from them, in the worker and on the CV page alike. Templates stay behind.
for (const dir of ['src/shared', 'src/epimoni', 'src/lexicon', 'src/schema'])
  await cp(join(ROOT, dir), join(DIST, dir), {
    recursive: true,
    filter: (f) => !f.split('/').pop().startsWith('_'),
  });
// `EPIMONI_API=http://127.0.0.1:8000 node build.mjs --dev` points the worker at a local
// backend, so the whole identity path, open a session, spend it, read the tier, can be run
// against the real FastAPI app rather than against a stubbed `fetch`. Dev builds only: a
// shipped build must never be able to talk to anything but the Lambda.
if (DEV && process.env.EPIMONI_API) {
  const file = join(DIST, 'src/epimoni/api.js');
  const src = await readFile(file, 'utf8');
  const patched = src.replace(
    /export const API = '[^']*';/,
    `export const API = '${process.env.EPIMONI_API}';`,
  );
  if (patched === src) {
    console.error('EPIMONI_API set but the API constant was not found in epimoni/api.js');
    process.exit(1);
  }
  await writeFile(file, patched);
  console.log(`dev build points at ${process.env.EPIMONI_API}`);
}
await writeFile(join(DIST, 'popup.html'), await read('src/popup/popup.html'));
await writeFile(join(DIST, 'popup.js'), await read('src/popup/popup.js'));
// The dashboard: the CV editor (the surface that makes the extension usable with no Epimoni
// account) and the application tracker, behind one menu. Its scripts are ES modules copied as
// they are to dist/src/dashboard, where `../shared/` resolves exactly as it does in src/.
await writeFile(join(DIST, 'dashboard.html'), await read('src/dashboard/dashboard.html'));
await cp(join(ROOT, 'src/dashboard'), join(DIST, 'src/dashboard'), {
  recursive: true,
  filter: (f) => !f.endsWith('.html'),
});
/**
 * Validate the manifest against the Chrome rules that fail at *load* time rather than at
 * build time: the ones that cost a debugging round trip through chrome://extensions.
 *
 * The first rule is here because it already bit us: `match_origin_as_fallback` is only
 * accepted when every pattern in that entry has a path of exactly `/*`, so scoping LinkedIn
 * to `/jobs/*` in the same entry made Chrome refuse the whole extension.
 */
function validateManifest(m, messages) {
  const problems = [];
  for (const [i, cs] of (m.content_scripts || []).entries()) {
    for (const pat of cs.matches || []) {
      const rest = pat.split('://')[1] || '';
      const path = rest.includes('/') ? rest.slice(rest.indexOf('/') + 1) : null;
      if (path === null) problems.push(`content_scripts[${i}] "${pat}" has no path (needs at least /*)`);
      else if (cs.match_origin_as_fallback && path !== '*') {
        problems.push(
          `content_scripts[${i}] "${pat}": match_origin_as_fallback requires the path to be exactly /*`,
        );
      }
    }
  }
  for (const pat of [...(m.host_permissions || []), ...(m.optional_host_permissions || [])]) {
    if (pat !== '<all_urls>' && !/^(\*|https?):\/\/[^/]+\/.*$/.test(pat))
      problems.push(`host permission "${pat}" is not a valid match pattern`);
  }
  const icons = { ...(m.icons || {}), ...(m.action?.default_icon || {}) };
  for (const rel of new Set(Object.values(icons))) {
    // A declared icon that is not on disk fails the load with a message that names the file
    // but not which manifest key asked for it.
    if (!existsSync(join(ROOT, rel))) problems.push(`declared icon "${rel}" does not exist`);
  }
  for (const pat of m.externally_connectable?.matches || []) {
    const host = (pat.split('://')[1] || '').split('/')[0];
    if (host.replace(/^\*\./, '').split('.').length < 2)
      problems.push(`externally_connectable "${pat}" needs at least two dot-separated labels`);
    if (!pat.endsWith('/*')) problems.push(`externally_connectable "${pat}" must end in /*`);
  }
  // Every __MSG_key__ the manifest uses must exist in the default locale, or Chrome refuses
  // to load with a message that does not name the key.
  for (const [field, value] of Object.entries(m)) {
    if (typeof value === 'string') {
      const hit = value.match(/^__MSG_(.+)__$/);
      if (hit && !messages[hit[1]])
        problems.push(
          `manifest.${field} references __MSG_${hit[1]}__, missing from _locales/${m.default_locale}`,
        );
    }
  }
  if (problems.length) {
    console.error('manifest validation failed:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

/**
 * Store-listing limits and locale parity.
 *
 * The Chrome Web Store caps the manifest `name` at 75 characters and `description` at 132 and
 * rejects the submission over them: a slow way to find out, since it happens after review
 * starts. And a key present in one locale but missing in another renders as the raw
 * `__MSG_…__` token for exactly the users who speak that language.
 */
async function validateLocales(m) {
  const locales = ['fr', 'en', 'es', 'pt_BR'];
  const loaded = {};
  for (const l of locales) loaded[l] = JSON.parse(await read(`_locales/${l}/messages.json`));
  const problems = [];
  const reference = Object.keys(loaded[m.default_locale]);
  for (const l of locales) {
    const keys = Object.keys(loaded[l]);
    for (const k of reference) if (!keys.includes(k)) problems.push(`_locales/${l} is missing "${k}"`);
    const name = loaded[l].ext_name?.message || '';
    const desc = loaded[l].ext_description?.message || '';
    if (!desc) problems.push(`_locales/${l} has no ext_description`);
    if (name.length > 75) problems.push(`_locales/${l} ext_name is ${name.length} chars (store limit 75)`);
    if (desc.length > 132)
      problems.push(`_locales/${l} ext_description is ${desc.length} chars (store limit 132)`);
  }
  // Every key a surface names must exist in every locale.
  //
  // Parity above catches a key present in one file and missing from another. This catches the
  // other half: a key the code asks for that no file has. Both render the same way, an empty
  // element, for exactly the users who speak that language, and neither throws, so nothing
  // downstream of here will ever report it.
  const used = new Set();
  for (const f of [
    'src/popup/popup.js',
    'src/popup/popup.html',
    'src/dashboard/dashboard.html',
    'src/dashboard/index.js',
    'src/dashboard/cv.js',
    'src/dashboard/applications.js',
    'src/content/index.js',
    'src/epimoni/pair.js',
    'src/epimoni/pair.html',
    'src/epimoni/allow.js',
    'src/epimoni/allow.html',
  ]) {
    const src = await read(f);
    for (const [, k] of src.matchAll(/\bt\('([a-z0-9_]+)'/g)) used.add(k);
    for (const [, k] of src.matchAll(/data-i18n="([a-z0-9_]+)"/g)) used.add(k);
  }
  // `field_<canonical key>` and `cvsection_<name>` are built at runtime from the resolver's
  // keys, so they cannot be read out of the source. The field registry *is* the list of
  // canonical keys, which makes this checkable rather than a gap. A scoped key `work.company`
  // asks for `field_work_company`: message names cannot hold a dot.
  for (const f of FIELDS) used.add(`field_${f.key.replace('.', '_')}`);
  for (const s of SECTIONS) used.add(`cvsection_${s}`);
  for (const k of used) {
    for (const l of locales)
      if (!loaded[l][k]) problems.push(`_locales/${l} is missing "${k}", which the code asks for`);
  }

  if (problems.length) {
    console.error('locale validation failed:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

/**
 * Language packs and fillers, against the field registry.
 *
 * This is what makes a contribution safe to merge without knowing the engine: a phrase for a
 * key the registry does not define, a section that does not exist, a pack or filler file that
 * is not listed in its index, or two fillers with one id, all fail here with a sentence that
 * says which file to fix. At runtime the resolver ignores an unknown key; this is where it is
 * reported instead of ignored.
 */
async function validatePacksAndFillers() {
  const problems = [];
  const known = new Set(FIELDS.map((f) => f.key));
  const sections = new Set(SECTIONS);
  const listed = new Set(PACKS.map((p) => p.lang));
  for (const pack of PACKS) {
    const where = `src/lexicon/${pack.lang}.js`;
    for (const key of Object.keys(pack.keys || {}))
      if (!known.has(key)) problems.push(`${where}: "${key}" is not a field in src/schema/fields.js`);
    for (const section of Object.keys(pack.sections || {}))
      if (!sections.has(section))
        problems.push(`${where}: "${section}" is not a section in src/schema/fields.js`);
    for (const [key, spec] of Object.entries(pack.keys || {}))
      for (const phrase of [...(spec.any || []), ...(spec.not || [])])
        if (phrase !== phrase.toLowerCase() || /[^a-z0-9 ]/.test(phrase))
          problems.push(
            `${where}: "${phrase}" under ${key} must be lowercase, unaccented words: labels are normalised`,
          );
  }
  for (const f of await readdir(join(ROOT, 'src/lexicon')))
    if (/^[a-z]{2,3}(-[a-z]{2})?\.js$/.test(f) && !listed.has(f.replace(/\.js$/, '')))
      problems.push(`src/lexicon/${f} is not listed in src/lexicon/index.js`);
  // Every field must be reachable: phrases in at least one pack, or an autocomplete token.
  const phrased = new Set([
    ...PACKS.flatMap((p) => Object.keys(p.keys || {})),
    ...Object.values(AUTOCOMPLETE).filter(Boolean),
  ]);
  for (const f of FIELDS)
    if (!phrased.has(f.key)) problems.push(`field "${f.key}" has no phrase in any pack`);

  const ids = new Map();
  for (const f of FILLERS) {
    if (!f?.id || !['site', 'widget'].includes(f.kind))
      problems.push(`a filler has no id or an unknown kind: ${f?.id}`);
    if (ids.has(f.id)) problems.push(`two fillers share the id "${f.id}"`);
    ids.set(f.id, f);
  }
  for (const kind of ['site', 'widget']) {
    const dir = join(ROOT, 'src/fillers', kind);
    if (!existsSync(dir)) continue;
    for (const file of await readdir(dir)) {
      const id = file.replace(/\.js$/, '');
      if (!ids.has(id)) problems.push(`src/fillers/${kind}/${file} is not listed in src/fillers/index.js`);
      if (!existsSync(join(ROOT, 'test/fixtures/fillers', id)))
        problems.push(`filler "${id}" has no fixture directory test/fixtures/fillers/${id}/`);
    }
  }
  if (problems.length) {
    console.error('language pack / filler validation failed:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

const manifest = JSON.parse(await read('manifest.json'));
if (DEV) {
  manifest.name = `DEV ${manifest.name.replace('__MSG_ext_name__', 'Epimoni')}`;
  const LOCAL = ['http://127.0.0.1/*', 'http://localhost/*'];
  manifest.content_scripts.push({
    js: ['content.js'],
    all_frames: true,
    run_at: 'document_idle',
    matches: LOCAL,
  });
  // Host permissions too, not just content-script matches. A declared content script does not
  // grant host *access*, and without access Chrome redacts `tab.url` from `tabs.query` and
  // refuses `scripting.executeScript`, which is what made the end-to-end test unable to find
  // its own fixture tab. In production that access comes from the user's click (activeTab);
  // a test has no user to click.
  manifest.host_permissions = [...manifest.host_permissions, ...LOCAL];
}
const built = TARGET.transform(manifest);
validateManifest(built, JSON.parse(await read(`_locales/${built.default_locale}/messages.json`)));
{
  // The target's own load-time rules, and one every target shares: a content script the
  // manifest declares must exist in the build. A missing one does not fail the load; the
  // script just never runs, and on the site that means pairing silently stops working.
  const problems = TARGET.validate(built);
  for (const cs of built.content_scripts || [])
    for (const f of cs.js || [])
      if (!existsSync(join(DIST, f))) problems.push(`content script "${f}" is not in ${TARGET.dist}/`);
  if (problems.length) {
    console.error(`${TARGET.id} manifest validation failed:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}
await validateLocales(built);
await validatePacksAndFillers();
await writeFile(join(DIST, 'manifest.json'), JSON.stringify(built, null, 2));
await cp(join(ROOT, '_locales'), join(DIST, '_locales'), { recursive: true });

await cp(join(ROOT, 'icons'), join(DIST, 'icons'), { recursive: true });

/**
 * Every relative import in a built ES module must resolve to a file that exists.
 *
 * A missing module in a service worker fails silently from the outside: chrome://extensions
 * shows the extension as loaded, and messages simply go unanswered. The options page fails
 * more visibly but no more usefully: a blank page with one line in a console nobody has
 * open. Both are cheap to catch here, and both have been caught here.
 */
{
  const fs = await import('node:fs');
  const problems = [];
  // Transitive: the worker imports cvdoc.js, which imports the packs and the registry, and a
  // missing file two hops away fails exactly as silently as one at the top.
  const { dirname, relative } = await import('node:path');
  const seen = new Set();
  const visit = async (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = await readFile(file, 'utf8');
    for (const [, rel] of src.matchAll(/from '(\.[^']+)'/g)) {
      const target = join(dirname(file), rel);
      if (!fs.existsSync(target)) problems.push(`${relative(DIST, file)} → ${rel}`);
      else await visit(target);
    }
  };
  for (const entry of ['background.js', 'src/dashboard/index.js']) await visit(join(DIST, entry));
  if (problems.length) {
    console.error('module imports that do not resolve in dist/:');
    for (const m of problems) console.error(`  - ${m}`);
    process.exit(1);
  }
  console.log(
    `${TARGET.dist}/ built (${TARGET.id}):`,
    fs.readdirSync(DIST).join(' '),
    '· module imports resolve',
  );
}
