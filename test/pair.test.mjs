// The `externally_connectable` listener, which e2e.mjs cannot reach.
//
// That listener only accepts https://www.epimoni30.com, and faking that origin in a real
// browser would need a local TLS certificate for a domain we do not own. So the worker is
// loaded here against a stubbed `chrome`, and the rules that decide what ends up in extension
// storage are asserted directly: the origin check, the field allowlist, the line the anonymous
// hand-off draws (the CV crosses, the session token does not) and, above all of them, that
// **nothing the site sends is written until the user accepts it** on the extension's own page.
//
// The stub is deliberately thin. It is not a model of Chrome: it is just enough surface for
// the module to install its listeners, and storage that remembers what was written, because
// what was written is the thing worth asserting.

import test from 'node:test';
import assert from 'node:assert/strict';

const SITE = 'https://www.epimoni30.com';
const JWT = 'aaa.bbb.ccc';

function stubChrome() {
  const local = {};
  const session = {};
  const tabs = [];
  const listeners = { external: [], internal: [], installed: [], action: [] };
  globalThis.chrome = {
    runtime: {
      id: 'test-ext',
      getURL: (p = '') => `chrome-extension://test-ext/${p}`,
      onMessageExternal: { addListener: (fn) => listeners.external.push(fn) },
      onMessage: { addListener: (fn) => listeners.internal.push(fn) },
      onInstalled: { addListener: (fn) => listeners.installed.push(fn) },
      onStartup: { addListener: () => {} },
      getManifest: () => ({ version: '0.1.0' }),
    },
    action: { onClicked: { addListener: (fn) => listeners.action.push(fn) } },
    permissions: {
      onAdded: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
      contains: async () => false,
      remove: async () => true,
    },
    tabs: {
      create: async ({ url }) => {
        tabs.push(url);
      },
      query: async () => [],
      sendMessage: async () => {},
    },
    scripting: { executeScript: async () => [] },
    storage: {
      local: {
        get: async (k) => (local[k] === undefined ? {} : { [k]: local[k] }),
        set: async (bag) => Object.assign(local, bag),
        remove: async (k) => {
          delete local[k];
        },
      },
      session: {
        get: async (k) => (session[k] === undefined ? {} : { [k]: session[k] }),
        set: async (bag) => Object.assign(session, bag),
        remove: async (keys) => {
          for (const k of [].concat(keys)) delete session[k];
        },
      },
    },
  };
  return { local, session, tabs, listeners };
}

/**
 * What `/users/me` answers for each token. The pairing is checked against this, not against
 * the names in the message.
 */
const ACCOUNTS = {
  [JWT]: { user: { user_id: 'u-1', email: 'camille@example.org', preference: {} } },
  'anon.anon.anon': { user: { user_id: 'u-anon', email: 'anonymous_1234@example.com', preference: {} } },
};
globalThis.fetch = async (url, init = {}) => {
  if (String(url).endsWith('/api/v1/users/me')) {
    const me = ACCOUNTS[init.headers?.['Access-Token']];
    return { ok: !!me, status: me ? 200 : 401, json: async () => me || { detail: 'no' } };
  }
  // Telemetry after an accepted pairing. No network in a unit test.
  return { ok: true, status: 200, json: async () => ({}) };
};

/**
 * The active document in the stored library.
 *
 * Storage holds `cvs` and an `active_cv_id`; the flat `cv` every other module reads is
 * derived on the way out of `store.read()` and deliberately never persisted, so a test that
 * asserts what was *written* has to go through the list.
 */
const activeCv = (bag) => (bag?.cvs || []).find((c) => c.id === bag.active_cv_id) || null;

const { listeners, local, session, tabs } = stubChrome();
await import('../src/background/index.js');

/** Drive the external listener, as a tab on `origin`, and resolve with its response. */
function external(msg, { origin = SITE, tab = { id: 1 } } = {}) {
  return new Promise((resolve) => listeners.external[0](msg, { origin, tab }, resolve));
}

/** Drive the internal listener as the confirmation page. */
const PAIR_PAGE = { id: 'test-ext', url: 'chrome-extension://test-ext/src/epimoni/pair.html' };
function internal(msg, sender = PAIR_PAGE) {
  return new Promise((resolve) => {
    const sync = listeners.internal[0](msg, sender, resolve);
    if (sync === false) return;
  });
}

/** A clean slate between tests: no pending request, no cooldown. Storage is kept. */
const reset = () => {
  for (const k of Object.keys(session)) delete session[k];
};

/** Request, then accept on the confirmation page, as the user would. */
async function pairAndAccept(msg) {
  reset();
  const req = await external(msg);
  if (!req.ok) return req;
  assert.equal(req.mode, 'confirm');
  return internal({ type: 'pair:accept', id: req.id });
}

const GOOD = {
  type: 'epimoni:pair',
  jwt: JWT,
  user_id: 'u-1',
  user_type: 'google',
  profile: { given_name: 'Camille', email: 'camille@example.org' },
};

test('a message from another origin is refused', async () => {
  reset();
  const res = await external(GOOD, { origin: 'https://evil.example' });
  assert.deepEqual(res, { ok: false, error: 'origin' });
});

test('a request writes nothing: it opens the confirmation page and waits', async () => {
  // The rule the rest of this file stands on. Any script on the site's origin can send this
  // message, a tag manager, an ad, a compromised dependency, so a request that paired on
  // arrival would let it swap the account under the user's feet.
  reset();
  const before = JSON.stringify(local);
  const opened = tabs.length;
  const req = await external({ ...GOOD, cv: { basics: { name: 'Mallory' } } });
  assert.equal(req.ok, true);
  assert.equal(req.mode, 'confirm');
  assert.equal(JSON.stringify(local), before, 'storage.local is untouched until the user accepts');
  assert.equal(tabs.length, opened + 1);
  assert.equal(tabs.at(-1), `chrome-extension://test-ext/src/epimoni/pair.html#${req.id}`);
  assert.deepEqual(await external({ type: 'epimoni:pair-status', id: req.id }), {
    ok: true,
    status: 'pending',
  });

  // The page shows the account the *server* names for this token, not the message's claims.
  const shown = await internal({ type: 'pair:pending', id: req.id });
  assert.equal(shown.kind, 'account');
  assert.equal(shown.email, 'camille@example.org');
  assert.equal(shown.cv_name, 'Mallory');
});

test('a refused request writes nothing, and the site is told so', async () => {
  reset();
  const before = JSON.stringify(local);
  const req = await external({ ...GOOD, cv: { basics: { name: 'X' } } });
  assert.deepEqual(await internal({ type: 'pair:refuse', id: req.id }), { ok: true });
  assert.equal(JSON.stringify(local), before);
  assert.deepEqual(await external({ type: 'epimoni:pair-status', id: req.id }), {
    ok: true,
    status: 'refused',
    mode: 'account',
  });
  // And a page that keeps asking cannot keep opening tabs.
  const opened = tabs.length;
  assert.deepEqual(await external(GOOD), { ok: false, error: 'cooldown' });
  assert.equal(tabs.length, opened);
});

test('one request at a time: a second cannot replace the one on screen', async () => {
  reset();
  const first = await external({ ...GOOD, cv: { basics: { name: 'Camille' } } });
  assert.equal(first.ok, true);
  assert.deepEqual(await external({ ...GOOD, cv: { basics: { name: 'Mallory' } } }), {
    ok: false,
    error: 'busy',
  });
  assert.equal((await internal({ type: 'pair:pending', id: first.id })).cv_name, 'Camille');
});

test('an expired request can no longer be accepted', async () => {
  reset();
  const req = await external({ ...GOOD, cv: { basics: { name: 'X' } } });
  session.pair_pending.at -= 10 * 60 * 1000;
  assert.deepEqual(await internal({ type: 'pair:accept', id: req.id }), { ok: false, error: 'expired' });
  assert.equal((await external({ type: 'epimoni:pair-status', id: req.id })).status, 'expired');
});

test('accepting needs the id the page was opened for', async () => {
  reset();
  await external({ ...GOOD, cv: { basics: { name: 'X' } } });
  assert.deepEqual(await internal({ type: 'pair:accept', id: 'guessed' }), { ok: false, error: 'expired' });
});

test('only an extension page can accept: a content script cannot', async () => {
  reset();
  const req = await external({ ...GOOD, cv: { basics: { name: 'X' } } });
  const page = { id: 'test-ext', tab: { id: 3 }, url: 'https://jobs.example.org/' };
  assert.deepEqual(await internal({ type: 'pair:accept', id: req.id }, page), {
    ok: false,
    error: 'forbidden',
  });
  assert.deepEqual(await internal({ type: 'pair:pending', id: req.id }, page), {
    ok: false,
    error: 'forbidden',
  });
});

test('a request must come from a tab', async () => {
  reset();
  assert.deepEqual(await external(GOOD, { tab: null }), { ok: false, error: 'origin' });
});

test('a token the server does not recognise is refused before anything is shown', async () => {
  reset();
  const opened = tabs.length;
  assert.deepEqual(await external({ ...GOOD, jwt: 'zzz.zzz.zzz' }), { ok: false, error: 'unverified' });
  assert.equal(tabs.length, opened);
});

test('a token that belongs to somebody else than the message says is refused', async () => {
  reset();
  assert.deepEqual(await external({ ...GOOD, user_id: 'u-victim' }), { ok: false, error: 'unverified' });
});

test('a token the server knows as anonymous only hands over the CV, whatever user_type says', async () => {
  const res = await pairAndAccept({
    ...GOOD,
    jwt: 'anon.anon.anon',
    user_id: 'u-anon',
    user_type: 'google',
    cv: { basics: { name: 'Alex' } },
  });
  assert.equal(res.mode, 'cv-only');
  assert.equal(local.epimoni.jwt, undefined);
});

test('an oversized CV is dropped, and a request with nothing left has nothing to give', async () => {
  reset();
  const huge = { basics: { name: 'X', summary: 'a'.repeat(300 * 1024) } };
  assert.deepEqual(await external({ type: 'epimoni:pair', cv: huge }), { ok: false, error: 'incomplete' });
});

test('an anonymous hand-off keeps the CV and never the token', async () => {
  // The site opens an anonymous session for every visitor before its first API call, so `jwt`
  // and `user_id` are present for somebody who has never signed in. That token is disposable
  // and keeping one for 31 days would pair the extension to a session. Their CV is their own
  // document going into their own browser.
  const cv = { basics: { name: 'Camille Dupont' }, work: [{ name: 'Acme' }] };
  const res = await pairAndAccept({ ...GOOD, user_type: 'anonymous', cv, cv_label: 'Mon CV' });
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'cv-only');

  const stored = local.epimoni;
  assert.equal(stored.jwt, undefined, 'an anonymous session token must never be stored');
  assert.equal(stored.user_id, undefined, 'nor the id it belongs to');
  assert.equal(stored.paired, false, 'and the popup must not claim an account');
  const doc = activeCv(stored);
  assert.equal(doc.cv.basics.name, 'Camille Dupont', 'the CV does cross');
  assert.equal(doc.source, 'site');
  assert.ok(Array.isArray(doc.cv.skills), 'the document is normalised, not stored raw');
  assert.ok(doc.profile?.email, 'a profile is stored, so filling works with no account at all');
});

test('a CV-only hand-off with no flat profile derives one from the document', async () => {
  const res = await pairAndAccept({
    type: 'epimoni:pair',
    cv: { basics: { name: 'Alex Martin', email: 'alex@example.org', phone: '0600000000' } },
  });
  assert.equal(res.ok, true);
  const derived = activeCv(local.epimoni).profile;
  assert.equal(derived.full_name, 'Alex Martin');
  assert.equal(derived.given_name, 'Alex');
  assert.equal(derived.family_name, 'Martin');
});

test('a malformed flat profile is dropped and derived from the CV instead', async () => {
  const res = await pairAndAccept({
    type: 'epimoni:pair',
    cv: { basics: { name: 'Alex Martin' } },
    profile: { full_name: { toString: 'x' }, email: 42 },
  });
  assert.equal(res.ok, true);
  assert.equal(activeCv(local.epimoni).profile.full_name, 'Alex Martin');
});

test('a hand-off with neither a token nor a CV has nothing to give', async () => {
  reset();
  assert.deepEqual(await external({ type: 'epimoni:pair' }), { ok: false, error: 'incomplete' });
});

test('a named session missing its jwt falls back to the CV-only path', async () => {
  const res = await pairAndAccept({ ...GOOD, jwt: undefined, cv: { basics: { name: 'X' } } });
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'cv-only');
  assert.equal(local.epimoni.jwt, undefined);
  assert.equal(local.epimoni.paired, false);
});

test('a named account pairs once accepted, and only the allowlisted fields are stored', async () => {
  const res = await pairAndAccept({
    ...GOOD,
    // What a Google login leaves in `localStorage.user`, none of which may reach extension
    // storage: collecting it would have no purpose (CWS limited-use policy).
    iss: 'https://accounts.google.com',
    azp: 'x.apps.googleusercontent.com',
    aud: 'x.apps.googleusercontent.com',
    nonce: 'n',
    nbf: 1,
    jti: 'j',
    picture: 'https://…/photo.jpg',
    email_verified: true,
  });
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'account');

  const stored = local.epimoni;
  assert.equal(stored.paired, true);
  assert.equal(stored.jwt, JWT);
  assert.equal(stored.user_type, 'google');
  for (const leaked of ['iss', 'azp', 'aud', 'nonce', 'nbf', 'jti', 'picture', 'email_verified']) {
    assert.equal(stored[leaked], undefined, `${leaked} must not be stored`);
  }
});

test('the site never gets the token back', async () => {
  reset();
  const req = await external({ ...GOOD, cv: { basics: { name: 'X' } } });
  assert.ok(!JSON.stringify(req).includes(JWT));
  const res = await internal({ type: 'pair:accept', id: req.id });
  assert.ok(!JSON.stringify(res).includes(JWT));
  const status = await external({ type: 'epimoni:pair-status', id: req.id });
  assert.deepEqual(status, { ok: true, status: 'accepted', mode: 'account' });
});

test('the CV document and builder id are stored, because the analysis needs them', async () => {
  const cv = { basics: { name: 'Camille Dupont', email: 'c@example.org' }, work: [{ name: 'Acme' }] };
  const res = await pairAndAccept({ ...GOOD, cv, builder_id: 'b-42' });
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'account');
  const doc = activeCv(local.epimoni);
  assert.equal(doc.cv.basics.name, 'Camille Dupont');
  assert.equal(doc.cv.basics.email, 'c@example.org');
  assert.equal(doc.cv.work[0].name, 'Acme');
  assert.equal(doc.source, 'account');
  assert.equal(doc.builder_id, 'b-42');
});

test('a pairing with no builder id still pairs', async () => {
  const res = await pairAndAccept({ ...GOOD, cv: { basics: { name: 'X' } } });
  assert.equal(res.ok, true);
});

test('linkedin and affiliate logins are named accounts too', async () => {
  for (const user_type of ['linkedin', 'google_affiliate']) {
    const res = await pairAndAccept({ ...GOOD, user_type });
    assert.equal(res.ok, true, `${user_type} should pair`);
    assert.equal(res.mode, 'account');
  }
});

test('ping answers without touching storage', async () => {
  const res = await external({ type: 'epimoni:ping' });
  assert.equal(res.ok, true);
  assert.equal(res.version, '0.1.0');
});

// The bridge (src/epimoni/bridge.js) reaches the worker as a content script on the site, not
// through `externally_connectable`. Same rules, and the sender the browser reports decides.
const BRIDGE_SENDER = {
  id: 'test-ext',
  tab: { id: 7 },
  frameId: 0,
  url: `${SITE}/fr/extension-chrome`,
  origin: SITE,
};
const bridged = (msg, sender = BRIDGE_SENDER) => internal({ type: 'site', msg }, sender);

test('bridge: a pairing request is a request, exactly as over externally_connectable', async () => {
  reset();
  const before = JSON.stringify(local);
  const opened = tabs.length;
  const req = await bridged({ ...GOOD, cv: { basics: { name: 'Camille' } } });
  assert.equal(req.ok, true);
  assert.equal(req.mode, 'confirm');
  assert.equal(JSON.stringify(local), before, 'nothing is written before the user accepts');
  assert.equal(tabs.at(-1), `chrome-extension://test-ext/src/epimoni/pair.html#${req.id}`);
  assert.equal(tabs.length, opened + 1);
  assert.deepEqual(await bridged({ type: 'epimoni:pair-status', id: req.id }), {
    ok: true,
    status: 'pending',
  });
});

test('bridge: Firefox reports a URL rather than an origin, and that is enough', async () => {
  const { origin, ...firefox } = BRIDGE_SENDER;
  assert.equal((await bridged({ type: 'epimoni:ping' }, firefox)).ok, true);
});

test('bridge: only the top frame of a tab on the site is heard', async () => {
  reset();
  const refused = { ok: false, error: 'origin' };
  // A frame the site embeds, a job board's content script, a sender with no tab.
  assert.deepEqual(await bridged(GOOD, { ...BRIDGE_SENDER, frameId: 3 }), refused);
  assert.deepEqual(
    await bridged(GOOD, {
      ...BRIDGE_SENDER,
      url: 'https://www.hellowork.com/x',
      origin: 'https://www.hellowork.com',
    }),
    refused,
  );
  assert.deepEqual(await bridged(GOOD, { id: 'test-ext', frameId: 0, url: SITE, origin: SITE }), refused);
  assert.equal(session.pair_pending, undefined, 'none of them parked a request');
});

test('bridge: the dev-only hook is external only', async () => {
  assert.deepEqual(await bridged({ type: 'epimoni:devfill', urlIncludes: '' }), { ok: false, error: 'type' });
});
