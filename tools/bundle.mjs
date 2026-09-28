// SPDX-License-Identifier: Apache-2.0
// The content-script bundler: ES modules in, one classic script out.
//
// A content script cannot be an ES module, and this project takes no bundler dependency, so
// this is the small one it needs. Each module becomes a function registered under its path
// and evaluated once, on first import: the CommonJS shape, which is what lets two language
// packs both `export default` without colliding, and lets a contributor's filler import from
// `../content/dom.js` like any other module. `build.mjs` and `test/measure.mjs` both use it,
// so the measured engine is the shipped engine.
//
// It understands the import/export forms this codebase writes, and refuses the rest with the
// file and line rather than bundling something it has not understood:
//
//   import x from './a.js';            import { a, b as c } from './a.js';
//   export default …;                  export function / const / let / class name …
//   export { a, b as c };
//
// It also enforces the filler contract (see `FORBIDDEN` below), because a rule that lives
// only in review is a rule that will eventually be merged past.

import { readFileSync } from 'node:fs';
import { dirname, join, normalize as normPath } from 'node:path';

/**
 * What a filler may never write. A filler touches the page only through the guarded API in
 * `src/content/guard.js`; each of these is a way around it. Checked on the source text, so a
 * filler that needs one of these words in a string or comment has to say it differently:
 * a small price for a rule nobody has to remember in review.
 */
export const FORBIDDEN = [
  [/\.click\s*\(/, 'clicks go through api.open / api.choose, which refuse submit buttons'],
  [/\.submit\s*\(|requestSubmit/, 'the extension never submits a form'],
  [/KeyboardEvent|['"]Enter['"]/, 'no synthetic keys: Enter submits forms'],
  [/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/, 'a filler makes no network call'],
  [/\bchrome\./, 'a filler has no extension API; the content script holds it'],
  [/\beval\s*\(|new Function|\bimport\s*\(/, 'no dynamic code'],
  [/\.innerHTML\s*=|insertAdjacentHTML|document\.write/, 'a filler writes values, not markup'],
  [/\.checked\s*=|type\s*===?\s*['"]checkbox/, 'checkboxes are never touched'],
];

const IMPORT = /^import\s+([\s\S]*?)\s+from\s+'([^']+)';?[ \t]*$/gm;

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

/** Turn one module's source into a `__define` call; returns the code and its dependencies. */
function transform(root, file) {
  const src = readFileSync(join(root, file), 'utf8');
  const deps = [];
  const exported = [];
  const problems = [];

  let code = src.replace(IMPORT, (whole, what, spec, at) => {
    const dep = normPath(join(dirname(file), spec)).replace(/\\/g, '/');
    deps.push(dep);
    const clause = what.trim();
    if (/^[A-Za-z_$][\w$]*$/.test(clause)) return `const ${clause} = __require('${dep}').default;`;
    const named = clause.match(/^\{([\s\S]*)\}$/);
    if (named) {
      const parts = named[1]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => p.replace(/^([\w$]+)\s+as\s+([\w$]+)$/, '$1: $2'));
      return `const { ${parts.join(', ')} } = __require('${dep}');`;
    }
    problems.push(`${file}:${lineOf(src, at)} unsupported import: ${whole.trim()}`);
    return whole;
  });

  code = code.replace(/^export\s+default\s+/m, () => {
    exported.push(['default', '__default']);
    return 'const __default = ';
  });
  code = code.replace(
    /^export\s+(async\s+function\*?|function\*?|const|let|class)\s+([\w$]+)/gm,
    (_, kw, name) => {
      exported.push([name, name]);
      return `${kw} ${name}`;
    },
  );
  code = code.replace(/^export\s*\{([^}]*)\};?[ \t]*$/gm, (_, list) => {
    for (const p of list
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)) {
      const [local, as = local] = p.split(/\s+as\s+/);
      exported.push([as, local]);
    }
    return '';
  });
  const stray = code.match(/^\s*(import|export)\s[^\n]*/m);
  if (stray) problems.push(`${file}:${lineOf(code, stray.index)} unsupported: ${stray[0].trim()}`);

  const exportsObj = exported.map(([as, local]) => (as === local ? as : `${as}: ${local}`)).join(', ');
  return {
    deps,
    exported: exported.map(([as]) => as),
    problems,
    code: `__define('${file}', (__require) => {\n${code}\nreturn { ${exportsObj} };\n});`,
  };
}

/** Every file reachable from `entries`, in a stable order. */
function collect(root, entries) {
  const seen = new Map();
  const visit = (file) => {
    if (seen.has(file)) return;
    const mod = transform(root, file);
    seen.set(file, mod);
    for (const d of mod.deps) visit(d);
  };
  for (const e of entries) visit(e);
  return seen;
}

/** Problems with a filler source: every forbidden construct, with file and line. */
export function fillerViolations(root, file) {
  const src = readFileSync(join(root, file), 'utf8');
  const out = [];
  src.split('\n').forEach((line, i) => {
    for (const [re, why] of FORBIDDEN) if (re.test(line)) out.push(`${file}:${i + 1} ${why}: ${line.trim()}`);
  });
  return out;
}

/**
 * The content script's body: every module under `src/content`, the language packs and the
 * fillers, with the content modules' exports in scope for `src/content/index.js`, which is a
 * classic script and uses them as globals. Not wrapped: the caller adds the outer IIFE and
 * whatever runs inside it (the real entry point, or the measurement runner).
 *
 * `fillerFiles` are checked against `FORBIDDEN`; any violation throws.
 */
export function bundleContent(root, { dev = false } = {}) {
  const exposed = [
    'src/content/dom.js',
    'src/content/resolve.js',
    'src/content/posting.js',
    'src/content/guard.js',
    'src/content/fill.js',
    'src/content/keywords.js',
  ];
  const entries = [...exposed, 'src/lexicon/index.js', 'src/fillers/index.js'];
  const mods = collect(root, entries);

  const problems = [...mods.values()].flatMap((m) => m.problems);
  for (const file of mods.keys())
    if (file.startsWith('src/fillers/') && file !== 'src/fillers/index.js')
      problems.push(...fillerViolations(root, file));
  if (problems.length) throw new Error(`content bundle refused:\n  - ${problems.join('\n  - ')}`);

  // One name, one meaning: two content modules exporting the same name would silently shadow.
  const names = new Map();
  for (const file of exposed)
    for (const n of mods.get(file).exported) {
      if (names.has(n)) throw new Error(`content bundle: "${n}" is exported by ${names.get(n)} and ${file}`);
      names.set(n, file);
    }

  return [
    '// Built by build.mjs from src/: do not edit.',
    `const EPIMONI_DEV = ${dev};`,
    'const __defs = {};',
    'const __cache = {};',
    'const __define = (id, f) => { __defs[id] = f; };',
    'const __require = (id) => {',
    "  if (!(id in __cache)) { if (!__defs[id]) throw new Error('bundle: no module ' + id); __cache[id] = __defs[id](__require); }",
    '  return __cache[id];',
    '};',
    ...[...mods.values()].map((m) => m.code),
    ...exposed.map((f) => `const { ${mods.get(f).exported.join(', ')} } = __require('${f}');`),
    "const { PACKS: EPIMONI_PACKS, AUTOCOMPLETE: EPIMONI_AUTOCOMPLETE } = __require('src/lexicon/index.js');",
    "const { FILLERS: EPIMONI_FILLERS } = __require('src/fillers/index.js');",
  ].join('\n');
}
