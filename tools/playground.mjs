// SPDX-License-Identifier: Apache-2.0
// Builds the playground into site/: `npm run playground`, and `--serve` to open it locally.
//
// The playground is the measurement, run in a visitor's browser. It loads the same engine
// bundle `build.mjs` ships and `test/measure.mjs` scores (`bundleContent`), the same runner and
// verdicts (`test/scoring.js`), and the same fixtures (`test/fixture-list.mjs`), so the number
// on the page is the number CI enforces.
//
// It is the free core only. `src/epimoni/` and `src/shared/store.js` are never copied: the
// page makes no network call, and the CV a visitor types stays in their browser.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleContent } from './bundle.mjs';
import { RUNNER_BODY } from '../test/scoring.js';
import { fixtureList } from '../test/fixture-list.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = join(ROOT, 'site');
const FIXTURES = join(ROOT, 'test', 'fixtures');

export async function buildPlayground() {
  await rm(SITE, { recursive: true, force: true });
  await mkdir(SITE, { recursive: true });

  // The page itself.
  for (const f of ['index.html', 'playground.js', 'playground.css'])
    await cp(join(ROOT, 'playground', f), join(SITE, f));

  // The engine: the shipped content-script bundle, plus the runner. Loaded into a fixture's
  // frame as a classic script, it leaves two functions on that frame's window and nothing else.
  const engine = [
    '// Built by tools/playground.mjs from src/: do not edit.',
    '(() => {',
    bundleContent(ROOT),
    'const __resolver = createResolver({ lexicons: EPIMONI_PACKS, autocomplete: EPIMONI_AUTOCOMPLETE });',
    `window.__epimoniRun = (profile, entries) => {${RUNNER_BODY}};`,
    "window.__epimoniTargets = () => deepQueryAll(document, '[data-expect]');",
    '})();',
  ].join('\n');
  await writeFile(join(SITE, 'engine.js'), engine);

  // The document model, as browser ES modules, keeping src/'s layout so relative imports hold.
  await mkdir(join(SITE, 'src', 'shared'), { recursive: true });
  await cp(join(ROOT, 'src/shared/cvdoc.js'), join(SITE, 'src/shared/cvdoc.js'));
  for (const dir of ['src/lexicon', 'src/schema'])
    await cp(join(ROOT, dir), join(SITE, dir), {
      recursive: true,
      filter: (f) => !f.split('/').pop().startsWith('_'),
    });
  await cp(join(ROOT, 'test/scoring.js'), join(SITE, 'scoring.js'));
  await cp(join(ROOT, 'test/cv.fixture.json'), join(SITE, 'sample-cv.json'));

  // The fixtures, without the advert captures (postings/ are for extraction, not filling).
  await cp(FIXTURES, join(SITE, 'fixtures'), {
    recursive: true,
    filter: (f) => !f.includes('/postings'),
  });

  // The picker, generated: a fixture appears here the moment `npm run measure` measures it.
  const list = [];
  for (const path of fixtureList(FIXTURES)) {
    const html = await readFile(join(FIXTURES, path), 'utf8');
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() || path;
    // An embed's fields live in its inner page; count those so the picker says what is there.
    const inner = [...html.matchAll(/<iframe[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    let all = html;
    for (const src of inner) all += await readFile(join(FIXTURES, path, '..', src), 'utf8').catch(() => '');
    const expects = [...all.matchAll(/data-expect="([^"]+)"/g)].map((m) => m[1]);
    list.push({
      path,
      title,
      fillable: expects.filter((e) => e !== 'none' && e !== 'ai-candidate').length,
      traps: expects.filter((e) => e === 'none').length,
      ai: expects.filter((e) => e === 'ai-candidate').length,
    });
  }
  await writeFile(join(SITE, 'fixtures.json'), `${JSON.stringify(list, null, 2)}\n`);
  // GitHub Pages runs Jekyll unless told not to, and Jekyll drops files starting with `_`:
  // which would take `fixtures/_react.js`, the controlled-input harness, with it.
  await writeFile(join(SITE, '.nojekyll'), '');
  return list;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/** A static server for site/, for local use and for `test/playground.mjs`. */
export function serveSite(port = 0) {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    if (path.includes('..')) {
      res.writeHead(400);
      res.end();
      return;
    }
    try {
      const body = await readFile(join(SITE, path));
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const list = await buildPlayground();
  console.log(`site/ built: ${list.length} fixtures`);
  if (process.argv.includes('--serve')) {
    const server = await serveSite(Number(process.env.PORT) || 4173);
    console.log(`playground at http://127.0.0.1:${server.address().port}/`);
  }
}
