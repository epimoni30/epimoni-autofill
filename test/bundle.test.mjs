// The bundler's half of the filler contract: code that could get around the guarded API is
// refused at build time, with the file and line, before anybody has to spot it in review.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleContent, fillerViolations } from '../tools/bundle.mjs';
import { FILLERS } from '../src/fillers/index.js';
import { FIELDS, SECTIONS } from '../src/schema/fields.js';
import { PACKS } from '../src/lexicon/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** A throwaway copy of the source tree, with one filler file written into it. */
function withFiller(code) {
  const dir = mkdtempSync(join(tmpdir(), 'epimoni-bundle-'));
  cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/fillers/widget/bad.js'), code);
  writeFileSync(
    join(dir, 'src/fillers/index.js'),
    "import bad from './widget/bad.js';\nexport const FILLERS = [bad];\n",
  );
  return dir;
}

test('the shipped fillers break no rule', () => {
  for (const kind of ['site', 'widget'])
    for (const f of readdirSync(join(ROOT, 'src/fillers', kind)))
      assert.deepEqual(fillerViolations(ROOT, `src/fillers/${kind}/${f}`), [], f);
  assert.doesNotThrow(() => bundleContent(ROOT));
});

test('a filler that clicks, submits, types Enter or fetches is refused, with its line', () => {
  const cases = {
    click: 'el.click();',
    submit: 'el.form.requestSubmit();',
    enter: "el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));",
    fetch: "fetch('https://example.org');",
    chrome: 'chrome.storage.local.get();',
    checkbox: 'box.checked = true;',
    markup: 'el.innerHTML = "<b>x</b>";',
  };
  for (const [name, line] of Object.entries(cases)) {
    const dir = withFiller(
      `export default {\n  id: 'bad',\n  kind: 'widget',\n  write(el) {\n    ${line}\n  },\n};\n`,
    );
    try {
      assert.throws(() => bundleContent(dir), /src\/fillers\/widget\/bad\.js:5/, name);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('an import the bundler does not understand is refused rather than guessed at', () => {
  const dir = withFiller(
    "export * from '../../content/dom.js';\nexport default { id: 'bad', kind: 'widget' };\n",
  );
  try {
    assert.throws(() => bundleContent(dir), /unsupported/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every pack speaks only of fields and sections the registry defines', () => {
  const keys = new Set(FIELDS.map((f) => f.key));
  for (const p of PACKS) {
    for (const k of Object.keys(p.keys)) assert.ok(keys.has(k), `${p.lang}: ${k}`);
    for (const s of Object.keys(p.sections || {})) assert.ok(SECTIONS.includes(s), `${p.lang}: ${s}`);
  }
});

test('filler ids are unique and kinds known', () => {
  const ids = FILLERS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of FILLERS) assert.ok(['site', 'widget'].includes(f.kind), f.id);
});
