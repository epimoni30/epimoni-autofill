// The sites with automatic filling on: which hosts a manifest pattern covers, and the one
// registered content script kept equal to the listed sites the browser has granted.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = {};
let granted = [];
let registered = [];
globalThis.chrome = {
  storage: {
    local: {
      get: async (k) => (k in mem ? { [k]: structuredClone(mem[k]) } : {}),
      set: async (o) => Object.assign(mem, structuredClone(o)),
      remove: async (k) => delete mem[k],
    },
  },
  permissions: { getAll: async () => ({ origins: [...granted] }) },
  scripting: {
    getRegisteredContentScripts: async ({ ids }) => registered.filter((s) => ids.includes(s.id)),
    registerContentScripts: async (list) => {
      registered.push(...structuredClone(list));
    },
    updateContentScripts: async (list) => {
      for (const s of list) registered = registered.map((r) => (r.id === s.id ? structuredClone(s) : r));
    },
    unregisterContentScripts: async ({ ids }) => {
      registered = registered.filter((s) => !ids.includes(s.id));
    },
  },
};
const sites = await import('../src/shared/sites.js');

const MANIFEST = {
  content_scripts: [
    { js: ['content.js'], matches: ['https://*.hellowork.com/*', 'https://candidat.francetravail.fr/*'] },
    { js: ['src/epimoni/bridge.js'], matches: ['https://www.epimoni30.com/*'] },
  ],
};

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
  granted = [];
  registered = [];
});

test('a site is its host, and only web pages have one', () => {
  assert.deepEqual(sites.siteOf('https://Jobs.Example.org/apply?x=1'), {
    host: 'jobs.example.org',
    scheme: 'https',
  });
  assert.deepEqual(sites.siteOf('http://careers.acme.fr/'), { host: 'careers.acme.fr', scheme: 'http' });
  assert.equal(sites.siteOf('chrome://extensions'), null);
  assert.equal(sites.siteOf('file:///tmp/x.html'), null);
});

test('a declared job board needs no permission; the bridge is not a fill script', () => {
  assert.ok(sites.declaredFor('www.hellowork.com', MANIFEST));
  assert.ok(sites.declaredFor('hellowork.com', MANIFEST));
  assert.ok(sites.declaredFor('candidat.francetravail.fr', MANIFEST));
  assert.ok(!sites.declaredFor('evilhellowork.com', MANIFEST), 'a suffix is not a subdomain');
  assert.ok(!sites.declaredFor('www.epimoni30.com', MANIFEST));
  assert.ok(!sites.declaredFor('careers.acme.fr', MANIFEST));
});

test('adding a site twice keeps one entry, and a malformed host is refused', async () => {
  await sites.addSite({ host: 'careers.acme.fr' });
  await sites.addSite({ host: 'careers.acme.fr' });
  assert.equal((await sites.listSites()).length, 1);
  assert.equal(await sites.addSite({ host: 'a/b' }), null);
  assert.ok(await sites.siteIsAuto('careers.acme.fr'));
  assert.ok(!(await sites.siteIsAuto('other.fr')));
});

test('the registered script covers exactly the granted, undeclared sites', async () => {
  await sites.addSite({ host: 'careers.acme.fr' });
  await sites.addSite({ host: 'jobs.example.org' });
  await sites.addSite({ host: 'www.hellowork.com' });
  granted = ['https://careers.acme.fr/*'];
  assert.deepEqual(await sites.syncSiteScripts(MANIFEST), ['https://careers.acme.fr/*']);
  assert.equal(registered.length, 1);
  assert.deepEqual(registered[0].matches, ['https://careers.acme.fr/*']);
  assert.deepEqual(registered[0].js, ['content.js']);

  granted.push('https://jobs.example.org/*');
  await sites.syncSiteScripts(MANIFEST);
  assert.equal(registered.length, 1, 'updated in place, not registered twice');
  assert.deepEqual(registered[0].matches.sort(), ['https://careers.acme.fr/*', 'https://jobs.example.org/*']);

  await sites.removeSite('careers.acme.fr');
  await sites.removeSite('jobs.example.org');
  assert.deepEqual(await sites.syncSiteScripts(MANIFEST), []);
  assert.equal(registered.length, 0, 'nothing left to match, nothing registered');
});
