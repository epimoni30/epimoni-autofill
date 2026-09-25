// Which token a metered call goes out with, and how many calls one advert costs.
//
// This is the half of the extension where a bug costs the user money or locks them out, so
// it is driven directly: the worker is loaded against a stubbed `chrome` and a stubbed
// `fetch` that *records every request*, and the assertions are about the requests, which
// endpoint, which `Access-Token`, and how many.
//
// The rule being protected: **one metered call per advert, and never a wall for somebody
// without an account.** Filling is free and needs no identity at all; the analysis is metered
// by the backend at one call an hour for free and anonymous users alike, and not at all for a
// paying customer.

import test from 'node:test';
import assert from 'node:assert/strict';

const CV = {
  basics: { name: 'Camille Dupont', email: 'c@example.org' },
  work: [{ name: 'Acme', position: 'Développeuse', startDate: '2020', endDate: '2024' }],
  skills: [{ name: 'Python' }],
};
const POSTING = {
  ok: true,
  text: 'Nous recherchons une développeuse Python '.repeat(8),
  words: 60,
  via: 'heuristic',
};

/** Everything the worker touches, plus a record of what it asked the network for. */
function stub({ responses }) {
  const local = {};
  const session = {};
  const listeners = { external: [], internal: [], installed: [], action: [] };
  globalThis.chrome = {
    runtime: {
      id: 'test-ext',
      getURL: (p = '') => `chrome-extension://test-ext/${p}`,
      onMessageExternal: { addListener: (fn) => listeners.external.push(fn) },
      onMessage: { addListener: (fn) => listeners.internal.push(fn) },
      onInstalled: { addListener: (fn) => listeners.installed.push(fn) },
      getManifest: () => ({ version: '0.1.0' }),
      openOptionsPage: () => {},
    },
    action: { onClicked: { addListener: (fn) => listeners.action.push(fn) } },
    tabs: { create: async () => {}, query: async () => [], sendMessage: async () => {} },
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

  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    calls.push({ path, token: init.headers?.['Access-Token'] || null });
    const make = responses[path];
    const body = typeof make === 'function' ? make(calls.filter((c) => c.path === path).length) : make;
    if (!body) return { ok: true, status: 200, json: async () => ({}) };
    return {
      ok: body.status === undefined || body.status < 400,
      status: body.status ?? 200,
      json: async () => body.json ?? {},
    };
  };
  return { local, session, listeners, calls };
}

const ANON = '/api/v1/users/anonymous-login';
const ANALYSE = '/api/v1/ml/analyse/cvVSoffer-doc?lang=fr';
const ME = '/api/v1/users/me';
const ok = (score = 72) => ({
  json: {
    ml: {
      ml_id: 'ml-1',
      content: { global_score: score, section_scores: { experience: 40, competences: 80 } },
    },
  },
});

/** Load a fresh copy of the worker: it keeps module-level state, so tests must not share one. */
async function loadWorker(env) {
  const harness = stub(env);
  // A query string makes the import cache miss, which is the only way to re-run a module.
  await import(`../src/background/index.js?t=${Math.random()}`);
  return harness;
}

// Sent as the popup would send it. The worker refuses most messages from a web page's frame,
// which is the next test's business, not every test's.
const EXTENSION_PAGE = { id: 'test-ext', url: 'chrome-extension://test-ext/popup.html' };
const ask = (listeners, msg, sender = EXTENSION_PAGE) =>
  new Promise((resolve) => listeners.internal[0](msg, sender, resolve));

test('a content script can read the profile and nothing that edits or erases the library', async () => {
  const h = await loadWorker({ responses: [] });
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });
  const page = { id: 'test-ext', tab: { id: 7 }, url: 'https://jobs.example.org/apply' };
  const stranger = { id: 'another-extension', url: 'chrome-extension://another-extension/x.html' };

  assert.ok(Object.keys((await ask(h.listeners, { type: 'profile' }, page)).profile || {}).length > 0);
  for (const type of [
    'cv:get',
    'cv:list',
    'cv:save',
    'cv:delete',
    'cv:clear',
    'extras',
    'forget',
    'unpair',
    'state',
  ])
    assert.deepEqual(await ask(h.listeners, { type }, page), { ok: false, error: 'forbidden' }, type);
  assert.deepEqual(await ask(h.listeners, { type: 'profile' }, stranger), { ok: false, error: 'forbidden' });
  // And the refusals really did nothing: the document is still there.
  assert.equal((await ask(h.listeners, { type: 'state' })).has_cv, true);
});

test('with no account at all: one anonymous session, one metered call, an answer', async () => {
  const h = await loadWorker({
    responses: { [ANON]: { json: { jwt: 'anon-1', user_id: 'a-1' } }, [ANALYSE]: ok(72) },
  });
  // A CV written in the extension itself: nobody signed in, nothing paired.
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });

  const res = await ask(h.listeners, {
    type: 'analyse',
    posting: POSTING,
    host: 'candidat.francetravail.fr',
    lang: 'fr',
  });
  assert.equal(res.ok, true, 'an anonymous user gets an analysis');
  assert.equal(res.mode, 'anonymous');
  assert.equal(res.teaser.score, 72);
  // `/editeur` reads a run back through the session that owns it, and that is not the
  // browser's session here, so the link is deliberately not offered.
  assert.equal(res.linkable, false);

  assert.equal(h.calls.filter((c) => c.path === ANALYSE).length, 1, 'exactly one metered call');
  assert.equal(h.calls.find((c) => c.path === ANALYSE).token, 'anon-1', 'sent with the anonymous session');
});

test('the session is opened on the first metered call, not before', async () => {
  const h = await loadWorker({
    responses: { [ANON]: { json: { jwt: 'anon-1', user_id: 'a-1' } }, [ANALYSE]: ok() },
  });
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });
  await ask(h.listeners, { type: 'state' });
  await ask(h.listeners, { type: 'profile' });
  // Filling a form is free and needs no identity: opening a session here would create an
  // account row for somebody who has only installed the extension.
  assert.equal(h.calls.length, 0, 'reading state and filling reach the network not at all');

  await ask(h.listeners, { type: 'analyse', posting: POSTING, lang: 'fr' });
  assert.equal(h.calls.filter((c) => c.path === ANON).length, 1);
});

test('a second advert reuses the session; the same advert costs nothing twice', async () => {
  const h = await loadWorker({
    responses: { [ANON]: { json: { jwt: 'anon-1', user_id: 'a-1' } }, [ANALYSE]: ok() },
  });
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });
  await ask(h.listeners, { type: 'analyse', posting: POSTING, lang: 'fr' });
  const again = await ask(h.listeners, { type: 'analyse', posting: POSTING, lang: 'fr' });
  // The backend memoises, but a memo hit is still charged, so the
  // cache that saves the user's hour is the local one.
  assert.equal(again.cached, true);
  const other = { ...POSTING, text: `${POSTING.text} Poste basé à Lyon, CDI, télétravail partiel.` };
  await ask(h.listeners, { type: 'analyse', posting: other, lang: 'fr' });

  assert.equal(h.calls.filter((c) => c.path === ANALYSE).length, 2, 'one call per distinct advert');
  assert.equal(h.calls.filter((c) => c.path === ANON).length, 1, 'and one session for both');
});

test('a paired account spends its own token, and gets the link back to the site', async () => {
  const h = await loadWorker({ responses: { [ANALYSE]: ok(81) } });
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });
  // `builder_id` hangs off the document, not off the account: it says which CV *on the site*
  // an analysis should attach to, so a locally typed CV correctly has none. Seeding it onto
  // the library entry is what a real pairing does.
  h.local.epimoni = {
    ...h.local.epimoni,
    jwt: 'account-1',
    user_id: 'u-1',
    user_type: 'google',
    paired: true,
    cvs: (h.local.epimoni.cvs || []).map((c) => ({ ...c, builder_id: 'b-42' })),
  };

  const res = await ask(h.listeners, { type: 'analyse', posting: POSTING, lang: 'fr' });
  assert.equal(res.mode, 'account');
  assert.equal(res.linkable, true);
  assert.equal(res.builder_id, 'b-42');
  assert.equal(h.calls.find((c) => c.path === ANALYSE).token, 'account-1');
  assert.equal(
    h.calls.filter((c) => c.path === ANON).length,
    0,
    'no anonymous session is opened for an account',
  );
});

test('an expired account token is marked stale and the answer still arrives', async () => {
  // The 31-day token ran out. Refusing outright would read as a broken extension; the honest
  // behaviour is to fall through to the free tier, say which allowance paid for it, and leave
  // the reconnect prompt where the popup and the panel already show it.
  const h = await loadWorker({
    responses: {
      [ANON]: { json: { jwt: 'anon-1', user_id: 'a-1' } },
      [ANALYSE]: (n) => (n === 1 ? { status: 401, json: {} } : ok(64)),
    },
  });
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });
  h.local.epimoni = { ...h.local.epimoni, jwt: 'expired-1', user_id: 'u-1', paired: true };

  const res = await ask(h.listeners, { type: 'analyse', posting: POSTING, lang: 'fr' });
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'anonymous');
  assert.equal(res.stale, true, 'the surface must be able to say which allowance was spent');
  assert.equal(h.local.epimoni.stale, true, 'and the popup must show the reconnect prompt');

  const tokens = h.calls.filter((c) => c.path === ANALYSE).map((c) => c.token);
  assert.deepEqual(tokens, ['expired-1', 'anon-1'], 'one retry, on a different token');
});

test('an expired anonymous session is re-minted once, and only once', async () => {
  const h = await loadWorker({
    responses: {
      [ANON]: (n) => ({ json: { jwt: `anon-${n}`, user_id: `a-${n}` } }),
      [ANALYSE]: { status: 401, json: {} },
    },
  });
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });
  const res = await ask(h.listeners, { type: 'analyse', posting: POSTING, lang: 'fr' });
  assert.equal(res.ok, false);
  assert.equal(res.kind, 'expired');
  // Two sessions and two attempts, then it stops. A retry loop against a 401 would mint an
  // account row per attempt.
  assert.equal(h.calls.filter((c) => c.path === ANON).length, 2);
  assert.equal(h.calls.filter((c) => c.path === ANALYSE).length, 2);
});

test('429 reports the wait and drops the cached allowance', async () => {
  const h = await loadWorker({
    responses: {
      [ANON]: { json: { jwt: 'anon-1', user_id: 'a-1' } },
      [ME]: {
        json: { user: { preference: { account_type: 'gratuit' } }, rate_limit: { rate_limited: false } },
      },
      [ANALYSE]: { status: 429, json: { detail: '1800' } },
    },
  });
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });
  // A session from an earlier analysis: without one, asking the tier makes no call at all.
  h.local.epimoni.anon = { jwt: 'anon-0', user_id: 'a-0', at: Date.now() };
  // Asked first, so there is a cached "you may analyse" to invalidate.
  assert.equal((await ask(h.listeners, { type: 'tier' })).rate_limited, false);

  const res = await ask(h.listeners, { type: 'analyse', posting: POSTING, lang: 'fr' });
  assert.equal(res.kind, 'quota');
  assert.equal(res.seconds, 1800);
  assert.equal(h.calls.filter((c) => c.path === ANALYSE).length, 1, 'a refusal is not retried');
  // The window moved. A stale "not rate limited" would have the panel promise a free analysis
  // it was refused a second ago.
  await ask(h.listeners, { type: 'tier' });
  assert.equal(h.calls.filter((c) => c.path === ME).length, 2, 'the cached entitlement was dropped');
});

test('a paying customer is told there is no limit, and it costs one unmetered read', async () => {
  const h = await loadWorker({
    responses: {
      [ME]: {
        json: { user: { preference: { account_type: 'premium' } }, rate_limit: { rate_limited: false } },
      },
    },
  });
  h.local.epimoni = { jwt: 'account-1', user_id: 'u-1', paired: true };
  const first = await ask(h.listeners, { type: 'tier' });
  assert.deepEqual(
    { paid: first.paid, tier: first.tier, mode: first.mode },
    { paid: true, tier: 'premium', mode: 'account' },
  );
  await ask(h.listeners, { type: 'tier' });
  assert.equal(h.calls.filter((c) => c.path === ME).length, 1, 'asked once, then cached');
});

test('asking the tier opens no session: opening the popup is not a metered call', async () => {
  const h = await loadWorker({ responses: {} });
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });
  const t = await ask(h.listeners, { type: 'tier' });
  assert.deepEqual(
    { mode: t.mode, paid: t.paid, rate_limited: t.rate_limited },
    { mode: 'anonymous', paid: false, rate_limited: false },
  );
  assert.equal(h.calls.length, 0, 'no request at all, and above all no anonymous-login');
  assert.equal(h.local.epimoni.anon, undefined, 'no session was stored');
});

test('an empty CV is refused before anything is spent', async () => {
  const h = await loadWorker({
    responses: { [ANON]: { json: { jwt: 'anon-1', user_id: 'a-1' } }, [ANALYSE]: ok() },
  });
  // A name and nothing else: enough to fill a form, not enough for a comparison to mean
  // anything. Charging an hour for that answer is the thing being prevented.
  await ask(h.listeners, { type: 'cv:save', cv: { basics: { name: 'Camille Dupont' } }, source: 'local' });
  const res = await ask(h.listeners, { type: 'analyse', posting: POSTING, lang: 'fr' });
  assert.equal(res.kind, 'no-cv');
  assert.equal(h.calls.length, 0, 'no session opened, no call made');
});

test('a comparison that assessed nothing is a refusal, not a score of zero', async () => {
  // An empty `section_scores` weights out to 0, so an analysis that could evidence no
  // criterion at all arrives looking exactly like a genuine 0% match. Showing "0 %" for that
  // is a confident lie about somebody's chances, on the surface they act on, which is why
  // the worker refuses an empty result whatever the status, and never caches it.
  const h = await loadWorker({
    responses: {
      [ANON]: { json: { jwt: 'anon-1', user_id: 'a-1' } },
      [ANALYSE]: { json: { ml: { ml_id: 'ml-empty', content: { global_score: 0, section_scores: {} } } } },
    },
  });
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });
  const res = await ask(h.listeners, { type: 'analyse', posting: POSTING, lang: 'fr' });
  assert.equal(res.ok, false);
  assert.equal(res.kind, 'empty');

  // And it must not be cached: one unlucky run would otherwise answer for that advert for
  // the rest of the session, with no way for the user to get a real comparison.
  const again = await ask(h.listeners, { type: 'analyse', posting: POSTING, lang: 'fr' });
  assert.equal(again.cached, undefined);
  assert.equal(h.calls.filter((c) => c.path === ANALYSE).length, 2, 'a retry actually retries');
});

test('an assessed zero is a real answer and still comes through', async () => {
  // The distinction the guard rests on: sections were scored, and they scored zero. Refusing
  // this would turn a correct (if brutal) answer into an error.
  const h = await loadWorker({
    responses: {
      [ANON]: { json: { jwt: 'anon-1', user_id: 'a-1' } },
      [ANALYSE]: {
        json: {
          ml: { ml_id: 'ml-0', content: { global_score: 0, section_scores: { profil: 0, experience: 0 } } },
        },
      },
    },
  });
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });
  const res = await ask(h.listeners, { type: 'analyse', posting: POSTING, lang: 'fr' });
  assert.equal(res.ok, true);
  assert.equal(res.teaser.score, 0);
});

test('the backend refusing with 502 scoring_empty says the same thing', async () => {
  // The two ship separately: an extension in somebody's browser talks to whatever Lambda is
  // deployed, so both the status and the shape have to be understood.
  const h = await loadWorker({
    responses: {
      [ANON]: { json: { jwt: 'anon-1', user_id: 'a-1' } },
      [ANALYSE]: { status: 502, json: { success: false, detail: 'scoring_empty' } },
    },
  });
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });
  const res = await ask(h.listeners, { type: 'analyse', posting: POSTING, lang: 'fr' });
  assert.equal(res.kind, 'empty');
});

test('disconnecting an account keeps the CV; erasing everything does not', async () => {
  const h = await loadWorker({ responses: {} });
  await ask(h.listeners, { type: 'cv:save', cv: CV, source: 'local' });
  h.local.epimoni = { ...h.local.epimoni, jwt: 'account-1', user_id: 'u-1', paired: true };

  await ask(h.listeners, { type: 'unpair' });
  const after = await ask(h.listeners, { type: 'state' });
  assert.equal(after.paired, false);
  assert.equal(after.has_cv, true, 'signing out is not a request to destroy the CV');
  assert.equal(h.local.epimoni.jwt, undefined);

  await ask(h.listeners, { type: 'forget' });
  assert.equal((await ask(h.listeners, { type: 'state' })).has_cv, false);
});

test('a CV whose entry carries no stored profile still fills forms', async () => {
  // What a bag migrated from the one-slot shape can look like: the CV came across, a stored
  // flat profile did not. Without a fallback such an install holds a complete CV and fills
  // nothing: the worst shape of failure, because everything on screen says it should work.
  const h = await loadWorker({ responses: {} });
  h.local.epimoni = {
    cvs: [
      {
        id: 'c1',
        label: null,
        source: 'local',
        builder_id: null,
        profile: null,
        cv: {
          basics: { name: 'Alex Martin', email: 'alex@example.org' },
          work: [{ name: 'Beta' }],
          skills: [{ name: 'Go' }],
        },
        taken_at: Date.now(),
        updated_at: Date.now(),
      },
    ],
    active_cv_id: 'c1',
    extras: { street: '3 rue de la Paix' },
  };

  const { profile } = await ask(h.listeners, { type: 'profile' });
  assert.equal(profile.full_name, 'Alex Martin', 'derived from the document');
  assert.equal(profile.email, 'alex@example.org');
  assert.equal(profile.street, '3 rue de la Paix', 'and the typed extras still win');

  const state = await ask(h.listeners, { type: 'state' });
  assert.ok(state.fields > 0, 'and the page does not report an empty CV');
});
