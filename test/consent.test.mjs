// Firefox's data-collection consent (src/epimoni/consent.js) and the two places it gates:
// the AI calls and usage events. The manifest decides whether there is anything to ask, so
// the stubbed `chrome` is given the Chrome manifest or the Firefox one, and what reaches
// `fetch` is the assertion.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TARGETS } from '../platform/index.mjs';

const source = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const MANIFESTS = { chrome: TARGETS.chrome.transform(source), firefox: TARGETS.firefox.transform(source) };

let manifest = MANIFESTS.chrome;
let granted = new Set();
let containsThrows = false;
const asked = [];
const fetched = [];

const store = {};
globalThis.chrome = {
  runtime: { id: 'x', getManifest: () => manifest, getURL: (p = '') => `ext://x/${p}` },
  permissions: {
    contains: async ({ data_collection }) => {
      asked.push(data_collection);
      if (containsThrows) throw new Error('unsupported');
      return data_collection.every((c) => granted.has(c));
    },
  },
  storage: {
    local: {
      get: async (k) => (store[k] === undefined ? {} : { [k]: store[k] }),
      set: async (bag) => Object.assign(store, bag),
      remove: async (k) => delete store[k],
    },
    session: {
      get: async (k) => (store[`s:${k}`] === undefined ? {} : { [k]: store[`s:${k}`] }),
      set: async (bag) => {
        for (const [k, v] of Object.entries(bag)) store[`s:${k}`] = v;
      },
      remove: async () => {},
    },
  },
  tabs: { create: async () => {} },
};
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  return { ok: true, status: 200, json: async () => ({}) };
};

const { AI_DATA, USAGE_DATA, missing } = await import('../src/epimoni/consent.js');
const { track } = await import('../src/epimoni/telemetry.js');
const { handleEpimoni, epimoniState } = await import('../src/epimoni/worker.js');

const PAIRED = {
  paired: true,
  jwt: 'aaa.bbb.ccc',
  stale: false,
  cv: { basics: { name: 'Camille', email: 'c@example.org' }, work: [{ name: 'Acme', position: 'Dev' }] },
};
const on = (m, g = []) => {
  manifest = MANIFESTS[m];
  granted = new Set(g);
  containsThrows = false;
  asked.length = 0;
  fetched.length = 0;
};

test('the Chrome build has nothing to ask, and never asks', async () => {
  on('chrome');
  assert.deepEqual(await missing(AI_DATA), []);
  assert.equal((await epimoniState(PAIRED)).consent, false);
  assert.equal(asked.length, 0);
});

test('Firefox: every category the add-on sends is declared optional', () => {
  const optional = MANIFESTS.firefox.browser_specific_settings.gecko.data_collection_permissions.optional;
  for (const c of [...AI_DATA, ...USAGE_DATA]) assert.ok(optional.includes(c), c);
});

test('Firefox without a grant: the AI is refused as consent, before any network call', async () => {
  on('firefox');
  assert.deepEqual(await missing(AI_DATA), AI_DATA);
  const posting = { text: 'Développeur Python, Nantes. '.repeat(30) };
  for (const type of ['analyse', 'letter'])
    assert.deepEqual(await handleEpimoni({ type, posting }, PAIRED), { ok: false, kind: 'consent' });
  const tier = await handleEpimoni({ type: 'tier' }, PAIRED);
  assert.equal(tier.ai, false);
  assert.equal(tier.consent, true);
  const st = await epimoniState(PAIRED);
  assert.equal(st.ai, false);
  assert.equal(st.consent, true);
  assert.deepEqual(fetched, [], 'nothing reached the network');
});

test('Firefox: an unpaired user is told to connect, not asked for consent', async () => {
  on('firefox');
  assert.deepEqual(await handleEpimoni({ type: 'analyse', posting: { text: 'x' } }, {}), {
    ok: false,
    kind: 'not-paired',
  });
  assert.equal((await epimoniState({})).consent, false);
});

test('Firefox with the grant: the AI is available', async () => {
  on('firefox', AI_DATA);
  assert.deepEqual(await missing(AI_DATA), []);
  assert.equal((await epimoniState(PAIRED)).ai, true);
});

test('Firefox: usage events stay off until they are granted', async () => {
  on('firefox', AI_DATA);
  await track('aaa.bbb.ccc', 'ext_fill', { what: 'fill_run', host: 'www.hellowork.com' });
  assert.deepEqual(fetched, []);
  on('firefox', [...AI_DATA, ...USAGE_DATA]);
  await track('aaa.bbb.ccc', 'ext_fill', { what: 'fill_run', host: 'www.hellowork.com' });
  assert.equal(fetched.length, 1);
});

test('an API that cannot answer is not a yes', async () => {
  on('firefox', AI_DATA);
  containsThrows = true;
  assert.deepEqual(await missing(AI_DATA), AI_DATA);
});
