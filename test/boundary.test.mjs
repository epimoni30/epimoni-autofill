// The line between the free core and the Epimoni add-on, enforced.
//
// The core, the CV library, JSON Résumé, the keyword engine that fills forms, must work
// with `src/epimoni/` deleted: no account, no token, no network. That is a property of the
// module graph, so it is checked on the module graph rather than trusted to review:
//
//   - only the core worker (`src/background/index.js`) may import from `src/epimoni/`, and
//     only its one entry point, `worker.js`;
//   - no core module holds a network primitive. The surfaces may *link* to the site (a link
//     is the user's choice to leave) but they may not call it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(m?js|html)$/.test(name) ? [p] : [];
  });
}

const files = walk(SRC).map((p) => ({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }));
const core = files.filter((f) => !f.path.startsWith('src/epimoni/'));
const addon = files.filter((f) => f.path.startsWith('src/epimoni/'));

test('the add-on exists and holds every backend module', () => {
  const names = addon.map((f) => f.path).sort();
  for (const m of ['api.js', 'identity.js', 'telemetry.js', 'worker.js'])
    assert.ok(names.includes(`src/epimoni/${m}`), `src/epimoni/${m} is missing`);
});

test('only the core worker imports the add-on, and only through worker.js', () => {
  for (const f of core) {
    const hits = [...f.src.matchAll(/from\s+['"]([^'"]*epimoni\/[^'"]*)['"]/g)].map((m) => m[1]);
    if (f.path === 'src/background/index.js') {
      assert.deepEqual(hits, ['../epimoni/worker.js'], `${f.path} reaches past the add-on's entry point`);
    } else {
      assert.deepEqual(hits, [], `${f.path} imports the Epimoni add-on`);
    }
  }
});

test('the public playground is core-only', () => {
  // It is published on GitHub Pages for anyone to try: it must show the free product and
  // nothing that needs an account, so it may not load the add-on or the extension's storage.
  const dir = join(ROOT, 'playground');
  for (const p of walk(dir)) {
    const src = readFileSync(p, 'utf8');
    assert.doesNotMatch(src, /epimoni\/|store\.js/, `${relative(ROOT, p)} reaches past the free core`);
  }
  // What the builder copies into site/: every `cp(` source, and the directory list it loops over.
  const builder = readFileSync(join(ROOT, 'tools/playground.mjs'), 'utf8');
  const copied = builder.split('\n').filter((l) => /\bcp\(|for \(const dir of/.test(l));
  assert.ok(
    copied.some((l) => l.includes('src/shared/cvdoc.js')),
    'the copy list was not found',
  );
  for (const line of copied)
    assert.doesNotMatch(
      line,
      /epimoni|store\.js|'src\/shared'/,
      `tools/playground.mjs copies past the core: ${line.trim()}`,
    );
});

test('no core module can reach the network', () => {
  const primitives = /\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|new EventSource|lambda-url/;
  for (const f of core) assert.doesNotMatch(f.src, primitives, `${f.path} holds a network primitive`);
});

test('the add-on depends on the core, never the reverse', () => {
  // The add-on may read the store and the document model; the core must not need it. This
  // pins the direction that makes a core-only fork a deletion rather than a refactor.
  for (const f of addon) {
    for (const [, spec] of f.src.matchAll(/from\s+['"]([^'"]+)['"]/g))
      assert.ok(
        spec.startsWith('./') || spec.startsWith('../shared/'),
        `${f.path} imports ${spec}: the add-on may only use its own modules and src/shared`,
      );
  }
});

test('the core worker runs with the add-on deleted, and never touches the network', async () => {
  // Simulate a fork that removed `src/epimoni/`: the worker's one add-on import is replaced by
  // no-ops, its core imports are pointed at the real modules, and `fetch` throws. Saving a CV
  // and asking for the fill profile (the whole free product) must still work.
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const worker = readFileSync(join(SRC, 'background/index.js'), 'utf8');
  const seam = /^import \{[^}]*\} from '\.\.\/epimoni\/worker\.js';$/m;
  assert.match(worker, seam, 'the add-on import is not the single line this test expects');
  const coreOnly = worker
    .replace(
      seam,
      'const installEpimoni = () => {}; const epimoniState = () => ({}); ' +
        'const handleEpimoni = async () => undefined; const forgetEpimoni = async () => {};',
    )
    .replace(/from '\.\.\/shared\//g, `from '${pathToFileURL(join(SRC, 'shared')).href}/`);
  const file = join(mkdtempSync(join(tmpdir(), 'core-only-')), 'worker.mjs');
  writeFileSync(file, coreOnly);

  const local = {};
  const listeners = [];
  const noop = { addListener: () => {} };
  globalThis.chrome = {
    runtime: {
      id: 'test-ext',
      getURL: (p = '') => `chrome-extension://test-ext/${p}`,
      onMessage: { addListener: (fn) => listeners.push(fn) },
      onMessageExternal: noop,
      onInstalled: noop,
      onStartup: noop,
      openOptionsPage: () => {},
    },
    action: { onClicked: noop },
    permissions: { onAdded: noop, onRemoved: noop },
    storage: {
      local: {
        get: async (k) => (local[k] === undefined ? {} : { [k]: local[k] }),
        set: async (bag) => Object.assign(local, bag),
        remove: async (k) => {
          delete local[k];
        },
      },
    },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('the core reached the network');
  };
  try {
    await import(pathToFileURL(file).href);
    const ask = (msg) =>
      new Promise((resolve) =>
        listeners[0](msg, { id: 'test-ext', url: 'chrome-extension://test-ext/dashboard.html' }, resolve),
      );
    const saved = await ask({
      type: 'cv:save',
      cv: {
        basics: { name: 'Camille Dupont', email: 'c@example.org', phone: '0612345678' },
        work: [{ name: 'Acme', position: 'Développeuse', startDate: '2020' }],
      },
    });
    assert.equal(saved.ok, true);
    const { profile, entries } = await ask({ type: 'profile' });
    assert.equal(profile.given_name, 'Camille');
    assert.equal(profile.email, 'c@example.org');
    assert.equal(entries.work?.length, 1);
    assert.equal((await ask({ type: 'state' })).has_cv, true);
    // The add-on's messages simply do not exist without it.
    assert.deepEqual(await ask({ type: 'analyse' }), { ok: false, error: 'unknown' });
  } finally {
    globalThis.fetch = realFetch;
  }
});
