// SPDX-License-Identifier: Apache-2.0
// The Epimoni add-on, worker half: pairing with the site, the offer analysis, the allowance,
// and usage reporting. Everything in this folder talks to epimoni30.com; nothing outside it
// does, and nothing outside it imports from here except `background/index.js`, through the
// four exports at the bottom. That seam is the architecture. The free core (the CV library,
// JSON Résumé, the keyword engine that fills forms) works with this folder deleted, and
// `test/boundary.test.mjs` fails the build if a core module ever reaches in.
//
// Why the fetches live in the worker: a service-worker fetch covered by `host_permissions` is
// not subject to CORS, so the backend needs no new allowed origin. A content-script fetch
// would need one, and Starlette matches origins by
// exact string, so `chrome-extension://*` would not work.

import { write, saveCv, unpairOnly } from '../shared/store.js';
import { cvIsAnalysable, cvSummary, fieldCurrent, normalizeCvDoc, toProfile } from '../shared/cvdoc.js';
import { track } from './telemetry.js';
import { apiFetch, whoIs } from './api.js';
import { entitlement, forgetEntitlement, resolveIdentity } from './identity.js';
import { AI_DATA, missing } from './consent.js';
import { applyRewrite, proposalsFrom } from './tailor.js';

const SITE = 'https://www.epimoni30.com';

/**
 * Comparing the CV against the advert on screen. **The only metered call this extension
 * makes**, and the reason the panel caches its own result.
 *
 * `/ml/analyse/cvVSoffer-doc` takes the CvDoc and the advert as raw text, so nothing has to
 * be stored on the account first: no `/cv/create`, no `/offers/create`, no upload. It
 * answers with `{ml: {ml_id, content}}` where `content.global_score` is the headline and
 * `content.section_scores` is the breakdown the teaser reads.
 *
 * The result is then readable on the site by its `ml_id` through `GET /ml/detail/{ml_id}`,
 * which is **unmetered**, so "voir l'analyse complète" is a link to a run already paid for
 * rather than a second analysis. Spending two calls for one advert is the trap this whole
 * shape exists to avoid.
 */
const ANALYSE_PATH = '/api/v1/ml/analyse/cvVSoffer-doc';
// The cover letter from the CV document and the advert's text, memoised on its inputs.
const LETTER_PATH = '/api/v1/ml/analyse/motivation/generate-doc';
// The CV rewritten for the advert: the same writer as the site's editor, from the document.
// Not memoised server-side (a second take is the point there), so the cache below is the only
// thing that keeps a reopened panel from paying twice.
const TAILOR_PATH = '/api/v1/ml/analyse/write-cv-doc';

/**
 * A cheap, stable fingerprint of a string. Not a security primitive: it names a cache entry.
 *
 * `crypto.subtle.digest` would be the obvious choice and is available here, but it is async
 * and this runs on the path that decides whether to spend money; a 32-bit FNV-ish hash over
 * the advert is enough to tell two adverts apart.
 */
function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const CACHE_KEY = 'analysis_cache';
// Long enough that reopening the panel, switching tab and coming back, or the worker being
// killed and restarted all hit the cache. `storage.session` is cleared when the browser
// closes, which is the right lifetime for something that cost the user a quota.
const CACHE_MAX = 12;

async function cachedAnalysis(key) {
  try {
    const bag = await chrome.storage.session.get(CACHE_KEY);
    return bag[CACHE_KEY]?.[key] || null;
  } catch {
    return null;
  }
}

async function cacheAnalysis(key, value) {
  try {
    const bag = await chrome.storage.session.get(CACHE_KEY);
    const cache = bag[CACHE_KEY] || {};
    cache[key] = value;
    // Bounded: an advert per tab per session would otherwise grow without limit.
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) delete cache[keys[0]];
    await chrome.storage.session.set({ [CACHE_KEY]: cache });
  } catch {
    /* no session storage: the analysis still works, it just costs again */
  }
}

/**
 * The teaser the panel shows, built from the full scoring rather than from a second call.
 *
 * `section_scores` already leaves out sections the advert was silent on, so the weakest two
 * are genuinely the weakest two the advert asked about, not artefacts of a criterion nobody scored.
 */
function teaserFrom(content) {
  const sections =
    content?.section_scores && typeof content.section_scores === 'object'
      ? Object.entries(content.section_scores)
      : [];
  return {
    score: typeof content?.global_score === 'number' ? content.global_score : null,
    weakest: sections
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2)
      .map(([name, score]) => ({ name, score })),
  };
}

/**
 * Pairing: the site hands over the session and the CV, and the user, not the site, decides.
 *
 * `externally_connectable` lets any script running on www.epimoni30.com message us: our own
 * code, but also every tag the site loads and every page on that origin. So a pairing message
 * is treated as a *request*, never as an instruction. It is cleaned, its token is checked
 * against the server, and it waits in `storage.session` until the user accepts it on an
 * extension page the site cannot script (`pair.html`). Without that step, one line of script
 * on the site could swap the paired account for an attacker's, after which every analysis
 * would send the user's CV to an account somebody else can read, or slip a CV of its own
 * into the library, to be typed into the next application form.
 *
 * What the confirmation page shows about the account comes from `/users/me` asked *with the
 * token being handed over*, not from the names in the message, so a request cannot claim to
 * be somebody it is not.
 *
 * Only the fields `sanitizePairing` names are kept, each with its type and a size cap. For a Google
 * login `localStorage.user` is the whole Google ID-token payload spread over our own fields,
 * and copying that into extension storage would be collecting data with no purpose, which is
 * the thing the CWS limited-use policy is about.
 */
const PENDING_KEY = 'pair_pending';
const RESULTS_KEY = 'pair_results';
const COOLDOWN_KEY = 'pair_cooldown_until';
// Long enough to read a confirmation page, short enough that a forgotten one does not sit
// around waiting to be clicked by accident.
const PENDING_TTL_MS = 5 * 60 * 1000;
// After a refusal, requests are refused outright for a minute: a page that keeps asking must
// not be able to keep opening tabs.
const COOLDOWN_MS = 60 * 1000;
// A CV is a few kilobytes. The cap is there so a request cannot fill `storage.local`.
const MAX_CV_BYTES = 256 * 1024;

const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : undefined);

/** The pairing message, reduced to fields of the right type and size. Anything else is dropped. */
export function sanitizePairing(msg) {
  const out = {};
  const jwt = str(msg?.jwt, 4096);
  if (jwt && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(jwt)) out.jwt = jwt;
  for (const [k, max] of [
    ['user_id', 200],
    ['user_type', 40],
    ['given_name', 200],
    ['family_name', 200],
    ['builder_id', 200],
    ['cv_label', 200],
  ]) {
    const v = str(msg?.[k], max);
    if (v !== undefined) out[k] = v;
  }
  if (Number.isFinite(msg?.taken_at)) out.taken_at = msg.taken_at;
  if (msg?.cv && typeof msg.cv === 'object' && !Array.isArray(msg.cv)) {
    let size = Number.POSITIVE_INFINITY;
    try {
      size = JSON.stringify(msg.cv).length;
    } catch {
      /* a cycle or a BigInt: not a CV */
    }
    if (size <= MAX_CV_BYTES) out.cv = normalizeCvDoc(msg.cv);
  }
  // The flat profile: string values only, bounded. It is derived from the CV when absent, so
  // dropping a malformed one costs nothing.
  if (msg?.profile && typeof msg.profile === 'object' && !Array.isArray(msg.profile)) {
    const profile = {};
    for (const [k, v] of Object.entries(msg.profile).slice(0, 100))
      if (/^[a-z0-9_.]{1,64}$/.test(k) && typeof v === 'string' && v.length <= 5000) profile[k] = v;
    if (Object.keys(profile).length) out.profile = profile;
  }
  return out;
}

async function sessionGet(key) {
  try {
    return (await chrome.storage.session.get(key))[key];
  } catch {
    return undefined;
  }
}
async function sessionSet(bag) {
  try {
    await chrome.storage.session.set(bag);
  } catch {
    /* no session storage: pairing then fails closed, which is the safe way to fail */
  }
}

async function livePending() {
  const p = await sessionGet(PENDING_KEY);
  if (p && Date.now() - p.at < PENDING_TTL_MS) return p;
  if (p) await settle(p.id, 'expired', p.kind);
  return null;
}

async function settle(id, status, mode) {
  const results = (await sessionGet(RESULTS_KEY)) || {};
  results[id] = { status, mode };
  // Bounded, like every other session cache here.
  const keys = Object.keys(results);
  if (keys.length > 20) delete results[keys[0]];
  await sessionSet({ [RESULTS_KEY]: results });
  const p = await sessionGet(PENDING_KEY);
  if (p?.id === id) await chrome.storage.session.remove(PENDING_KEY).catch(() => {});
}

/**
 * Receive a request: clean it, verify it, park it, and open the page where the user decides.
 * Returns what the site is told, never whether the user will accept.
 */
async function requestPairing(msg) {
  const cooldown = await sessionGet(COOLDOWN_KEY);
  if (cooldown && Date.now() < cooldown) return { ok: false, error: 'cooldown' };
  // One request at a time. A second one while the first is on screen could otherwise change
  // what the user is about to accept under their cursor.
  if (await livePending()) return { ok: false, error: 'busy' };

  const picked = sanitizePairing(msg);
  if (!picked.cv && !picked.profile) return { ok: false, error: 'incomplete' };

  // Two hand-offs, and the difference is the token.
  //
  // The site opens an anonymous session for *every* visitor before its first API call, so a
  // `jwt` and a `user_id` are present for somebody who has never signed in. That token stays
  // where it is: it is disposable by design and keeping one for 31 days would pair the
  // extension to a session rather than to an account. Such a visitor's CV is still worth
  // taking: it is their own document, going into their own browser. So an anonymous
  // hand-off gives up only the identity half, and any AI call goes out on the session the
  // worker opens for itself (epimoni/identity.js).
  let kind = 'cv-only';
  let account = null;
  if (picked.jwt && picked.user_id && picked.user_type !== 'anonymous') {
    const who = await whoIs(picked.jwt);
    // Fail closed: a token the server does not recognise, or recognises as somebody other
    // than the message says, is not paired, and neither is anything that came with it.
    if (!who.ok) return { ok: false, error: who.kind === 'network' ? 'network' : 'unverified' };
    if (who.user_id !== picked.user_id) return { ok: false, error: 'unverified' };
    if (!who.anonymous) {
      kind = 'account';
      account = { email: who.email };
    }
  }
  if (kind === 'cv-only') {
    for (const k of ['jwt', 'user_id', 'user_type', 'given_name', 'family_name']) delete picked[k];
    if (!picked.cv) return { ok: false, error: 'incomplete' };
  }

  const id = crypto.randomUUID();
  const cvName = picked.cv ? fieldCurrent(picked.cv.basics?.name) : '';
  await sessionSet({
    [PENDING_KEY]: {
      id,
      at: Date.now(),
      kind,
      picked,
      shown: { email: account?.email || null, cv_name: cvName || null, cv_label: picked.cv_label || null },
    },
  });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`src/epimoni/pair.html#${id}`) });
  return { ok: true, mode: 'confirm', id };
}

/** Apply an accepted request. The only code path that writes a pairing. */
async function applyPairing({ kind, picked }) {
  if (kind === 'cv-only') {
    // Not `paired`: no account is attached, and the popup must not claim one.
    await write({ paired: false });
    // A hand-off **adds** to the library rather than replacing it. Matching on `builder_id`
    // makes re-pairing the same site document an update, not a copy.
    const saved = await saveCv({
      cv: picked.cv,
      source: 'site',
      label: picked.cv_label || null,
      builder_id: picked.builder_id || null,
      profile: picked.profile || toProfile(picked.cv),
      taken_at: picked.taken_at || Date.now(),
    });
    // No telemetry here: there is no token to send it with, and opening a session purely to
    // report that a CV arrived would create an account row for somebody who asked for nothing.
    return saved ? { ok: true, mode: 'cv-only' } : { ok: false, error: 'library-full' };
  }

  // `stale: false` explicitly: re-pairing is exactly how an expired token is replaced.
  // Identity and document go to different places (the token onto the bag, the CV into the
  // library), so this is two writes. `write` strips the CV fields out of `picked` itself,
  // which is what stops a stale copy shadowing the library entry on the next read.
  let state = await write({ ...picked, paired: true, paired_at: Date.now(), stale: false });
  if (picked.cv) {
    state =
      (await saveCv({
        cv: picked.cv,
        source: 'account',
        label: picked.cv_label || null,
        builder_id: picked.builder_id || null,
        profile: picked.profile || toProfile(picked.cv),
        taken_at: picked.taken_at || Date.now(),
      })) || state;
  }
  // A plan bought since the last look, or a pairing onto a different account: the cached
  // answer belongs to whoever was here before.
  await forgetEntitlement();
  await track(state.jwt, 'ext_paired', {
    user_type: state.user_type || 'unknown',
    has_profile: !!state.profile,
  });
  return { ok: true, mode: 'account' };
}

/**
 * What the site may ask, whichever way it reached us. `from` is `{origin, tab}` as the browser
 * reported it, never as the message claims.
 *
 * Two transports lead here, one rule set. `externally_connectable` (Chrome only) is how the
 * site that is live today talks to us; the bridge (`bridge.js`, a content script on the site,
 * every browser) is how it talks to us from now on, and it is the only one Firefox has. Keeping
 * the decision here means the transports carry messages and decide nothing.
 */
async function fromSite(msg, from) {
  if (!from.origin || from.origin !== SITE) return { ok: false, error: 'origin' };
  if (msg?.type === 'epimoni:ping') return { ok: true, version: chrome.runtime.getManifest().version };

  // The site asks how its request ended, by the id it was given. It learns accepted, refused
  // or expired, never anything about the library or the account already paired.
  if (msg?.type === 'epimoni:pair-status') {
    const id = typeof msg.id === 'string' ? msg.id : '';
    const pending = await livePending();
    if (pending?.id === id) return { ok: true, status: 'pending' };
    const done = (await sessionGet(RESULTS_KEY))?.[id];
    return done ? { ok: true, ...done } : { ok: false, error: 'unknown' };
  }

  if (msg?.type !== 'epimoni:pair') return { ok: false, error: 'type' };
  // A page, not a worker or another extension's frame: the request has to have come from a tab.
  if (!from.tab?.id) return { ok: false, error: 'origin' };
  return requestPairing(msg).catch(() => ({ ok: false, error: 'failed' }));
}

/**
 * The bridge's envelope: `{type: 'site', msg}` from `bridge.js`, reached through the core
 * worker's message listener. Only the top frame of a tab on the site counts: the bridge is
 * declared for top frames only, and a frame the site embeds is somebody else's page.
 * `sender.origin` is Chrome's; Firefox gives the URL, which says the same.
 */
function fromBridge(msg, sender) {
  if (!sender?.tab?.id || sender.frameId !== 0) return { ok: false, error: 'origin' };
  let origin = sender.origin;
  if (!origin) {
    try {
      origin = new URL(sender.url).origin;
    } catch {
      return { ok: false, error: 'origin' };
    }
  }
  return fromSite(msg.msg, { origin, tab: sender.tab });
}

function onExternal(msg, sender, respond) {
  // Development builds only: run the toolbar path against a named tab and report back what
  // happened. A shipped build has EPIMONI_DEV false, so the site can never make the
  // extension act on another tab. External only: the bridge never forwards it.
  if (
    msg?.type === 'epimoni:devfill' &&
    sender.origin === SITE &&
    typeof EPIMONI_DEV !== 'undefined' &&
    EPIMONI_DEV
  ) {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => t.url?.includes(msg.urlIncludes || ''));
        if (!tab) {
          respond({ ok: false, error: 'no matching tab', urls: tabs.map((t) => t.url).slice(0, 20) });
          return;
        }
        const injected = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ['content.js'],
        });
        const answer = await chrome.tabs.sendMessage(tab.id, { type: 'fill' });
        respond({ ok: true, tabId: tab.id, url: tab.url, frames: injected.length, answer });
      } catch (e) {
        respond({ ok: false, error: String(e?.message ? e.message : e) });
      }
    })();
    return true;
  }
  fromSite(msg, { origin: sender.origin, tab: sender.tab }).then(respond);
  return true; // async respond
}

/** The confirmation page's three questions: what is waiting, yes, no. Extension pages only. */
async function pairingDecision(msg) {
  const pending = await livePending();
  if (!pending || pending.id !== msg?.id) return { ok: false, error: 'expired' };
  if (msg.type === 'pair:pending') {
    const cv = pending.picked.cv;
    return {
      ok: true,
      kind: pending.kind,
      ...pending.shown,
      summary: cv ? cvSummary(cv, {}) : null,
      // What the page asks the browser for inside the Accept click, where one asks (Firefox):
      // only an account pairing turns the AI on, so only it needs the grant.
      consent: pending.kind === 'account' ? await missing(AI_DATA) : [],
    };
  }
  if (msg.type === 'pair:refuse') {
    await settle(pending.id, 'refused', pending.kind);
    await sessionSet({ [COOLDOWN_KEY]: Date.now() + COOLDOWN_MS });
    return { ok: true };
  }
  // pair:accept
  const res = await applyPairing(pending);
  await settle(pending.id, res.ok ? 'accepted' : 'failed', res.mode || pending.kind);
  return res;
}

/**
 * The AI features are for a paired Epimoni account.
 *
 * Filling, the CV, the PDF, the tracker and the skills line are the free core and need
 * nothing. What reaches the backend's models needs an account the user connected from the
 * site, and a token that has not expired: refused here, before any identity is resolved, so
 * a visitor without one never opens a session or reaches the network.
 */
export const aiAllowed = (state) => Boolean(state?.paired && state?.jwt && !state?.stale);

/**
 * Why the AI is not available, for a surface to say, or null when it is.
 *
 * The account comes first and is decided without any call. Then, on a browser that asks
 * (Firefox), the user's consent to the CV and the advert leaving the machine: a paired
 * account is not a grant, because the grant is the browser's to record (consent.js).
 */
const aiRefusal = async (state) => {
  if (!aiAllowed(state)) return { ok: false, kind: state?.paired && state?.jwt ? 'expired' : 'not-paired' };
  return (await missing(AI_DATA)).length ? { ok: false, kind: 'consent' } : null;
};

/**
 * One metered call to the backend, with the identity it goes out under.
 *
 * Returns `{res, ident}`, or `{fail}` with the answer a surface should show. Shared
 * by every paid feature, because the rules are the same for all of them: resolve an identity
 * only now (it may open a session), retry once on a 401, and on a 429 forget the cached
 * allowance so the panel stops promising a free call it was just refused.
 */
async function meteredCall(state, msg, path, body) {
  const ident = await resolveIdentity(state, { mint: false });
  if (!ident.ok || ident.mode !== 'account') return { fail: { ok: false, kind: 'not-paired' } };

  const res = await apiFetch(ident.jwt, `${path}?lang=${encodeURIComponent(msg.lang || 'fr')}`, {
    method: 'POST',
    body,
  });

  // An expired account token is not retried on another identity: the AI is an account's,
  // so the answer is to reconnect. The pairing is marked stale, which is what makes the popup
  // and the panel say so.
  if (!res.ok && res.kind === 'expired' && ident.mode === 'account') await write({ stale: true });

  if (!res.ok) {
    if (res.kind === 'quota') {
      // The window just moved. A cached "not rate limited" would make the panel promise a
      // free call it has this second been refused.
      await forgetEntitlement();
      await track(ident.jwt, 'ext_fill', { what: 'paywall_shown', host: msg.host || '', mode: ident.mode });
    }
    return { fail: { ...res, mode: ident.mode } };
  }
  return { res, ident };
}

/**
 * Compare the CV against the advert the content script scraped.
 *
 * Every branch here decides whether the user spends a metered call, so the order matters:
 * refuse for free first (no CV, no advert), answer from cache second, and only then reach
 * the network, and only then resolve an identity, because resolving one opens a session.
 *
 * It no longer requires a paired account. A free or anonymous caller is metered by the
 * backend at one model-backed call an hour, the website's own free tier, not a second
 * allowance, and a paying customer is not metered at all. So the tiering this
 * feature needs already exists server-side; the extension's job is to pick the right token
 * and to say plainly which tier the person is on.
 */
async function analyse(state, msg) {
  const refused = await aiRefusal(state);
  if (refused) return refused;
  const text = String(msg?.posting?.text || '').trim();
  // The CV, wherever it came from: paired from an account, handed over by an anonymous
  // session, or typed into the extension's own editor. All three land in `state.cv`.
  if (!state.cv || !cvIsAnalysable(state.cv)) return { ok: false, kind: 'no-cv' };
  if (!text) return { ok: false, kind: 'no-posting' };

  const key = `${fingerprint(text)}:${fingerprint(JSON.stringify(state.cv))}`;
  const hit = await cachedAnalysis(key);
  // The backend memoises the same CV against the same advert, but
  // a memo hit is still charged, so the cache that actually saves the user money is this one.
  if (hit) return { ...hit, cached: true };

  const got = await meteredCall(state, msg, ANALYSE_PATH, {
    content: state.cv,
    offer_text: text,
    builder_id: state.builder_id || null,
  });
  if (got.fail) return got.fail;
  const { res, ident } = got;

  const ml = res.data?.ml || {};
  // A defence the backend now also mounts, kept here because the two ship separately: an
  // extension in somebody's browser talks to whatever Lambda is deployed, and an empty
  // `section_scores` renders as a confident "Correspondance : 0 %". Treating it as a refusal
  // is the only honest reading, and it must not be cached, or one unlucky run would answer
  // for that advert for the rest of the session.
  const scored =
    ml.content &&
    typeof ml.content === 'object' &&
    ml.content.section_scores &&
    Object.keys(ml.content.section_scores).length > 0;
  if (!scored) return { ok: false, kind: 'empty', mode: ident.mode };

  const answer = {
    ok: true,
    ml_id: ml.ml_id || ml.id || null,
    // Only an account can open the run on the site: `/editeur` needs a session that owns it.
    // Offering the link to an anonymous caller would send them to a page that finds nothing.
    builder_id: ident.mode === 'account' ? state.builder_id || null : null,
    linkable: ident.mode === 'account',
    mode: ident.mode,
    teaser: teaserFrom(ml.content),
  };
  await cacheAnalysis(key, answer);
  await track(ident.jwt, 'ext_fill', {
    what: 'heuristic_hit',
    host: msg.host || '',
    via: msg.posting?.via || '',
    words: msg.posting?.words || 0,
    mode: ident.mode,
  });
  return answer;
}

/**
 * A cover letter for the advert on screen, written by the backend, never into the form.
 *
 * The panel shows it and the user inserts it with a click: prose written in somebody's name
 * is theirs to read before it goes anywhere. `max_chars` is the form's own limit (France
 * Travail's 1500), which the backend holds the letter to with one repair pass.
 *
 * Same order as the analysis: refuse for free, answer from cache, only then spend. The
 * backend memoises the same inputs without charging, and the cache here spares even the
 * round trip when the panel is reopened.
 */
async function letter(state, msg) {
  const refused = await aiRefusal(state);
  if (refused) return refused;
  const text = String(msg?.posting?.text || '').trim();
  if (!state.cv || !cvIsAnalysable(state.cv)) return { ok: false, kind: 'no-cv' };
  if (!text) return { ok: false, kind: 'no-posting' };
  const max =
    Number.isInteger(msg.max_chars) && msg.max_chars >= 300 && msg.max_chars <= 10000 ? msg.max_chars : null;

  const key = `letter:${fingerprint(text)}:${fingerprint(JSON.stringify(state.cv))}:${max ?? ''}`;
  const hit = await cachedAnalysis(key);
  if (hit) return { ...hit, cached: true };

  const got = await meteredCall(state, msg, LETTER_PATH, {
    content: state.cv,
    offer_text: text,
    template: '1',
    max_chars: max,
    builder_id: state.builder_id || null,
  });
  if (got.fail) return got.fail;
  const { res, ident } = got;

  const paragraphs = (Array.isArray(res.data?.ml?.content?.paragraphs) ? res.data.ml.content.paragraphs : [])
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  if (!paragraphs.length) return { ok: false, kind: 'empty', mode: ident.mode };
  // Joined the way the backend measures it, so the count the panel shows is the one the
  // budget was held to.
  const body = paragraphs.join('\n\n');
  const answer = {
    ok: true,
    text: body,
    paragraphs,
    subject: String(res.data?.ml?.content?.objet || '').trim(),
    chars: body.length,
    limit: max,
    within: max ? body.length <= max : true,
    mode: ident.mode,
  };
  await cacheAnalysis(key, answer);
  await track(ident.jwt, 'ext_fill', {
    what: 'letter_generated',
    host: msg.host || '',
    limit: max || 0,
    within: answer.within,
    mode: ident.mode,
  });
  return answer;
}

/**
 * The CV adapted to the advert on screen, in two steps: the proposals, then the user's choice.
 *
 * `tailor` spends the one call. The backend proposes rewrites (headline, summary, each role's
 * title and bullets, skills); they are cached here with the document they were made against,
 * and the surface gets them to review, every one that adds material marked (see `tailor.js`
 * for why). `tailor:save` spends nothing: it applies the changes the user ticked, from the
 * cache, never from text the page sends, and saves the result as a new CV beside the original,
 * which stays the active one.
 *
 * Same order as the analysis: refuse for free, answer from cache, only then spend.
 */
const tailorKey = (state, text) => `tailor:${fingerprint(text)}:${fingerprint(JSON.stringify(state.cv))}`;

async function tailorCv(state, msg) {
  const refused = await aiRefusal(state);
  if (refused) return refused;
  const text = String(msg?.posting?.text || '').trim();
  if (!state.cv || !cvIsAnalysable(state.cv)) return { ok: false, kind: 'no-cv' };
  if (!text) return { ok: false, kind: 'no-posting' };

  const key = tailorKey(state, text);
  const hit = await cachedAnalysis(key);
  if (hit) {
    const saved = hit.saved && (state.cvs || []).some((c) => c.id === hit.saved.cv_id) ? hit.saved : null;
    return { ok: true, proposals: hit.proposals, saved, mode: hit.mode, cached: true };
  }

  const got = await meteredCall(state, msg, TAILOR_PATH, {
    content: state.cv,
    offer_text: text,
    builder_id: state.builder_id || null,
  });
  if (got.fail) return got.fail;
  const { res, ident } = got;

  const changes = Array.isArray(res.data?.ml?.content?.changes) ? res.data.ml.content.changes : [];
  const proposals = proposalsFrom(state.cv, changes).map((p) => ({ ...p, reason: p.reason.slice(0, 300) }));
  if (!proposals.length) return { ok: false, kind: 'empty', mode: ident.mode };
  await cacheAnalysis(key, { changes, proposals, mode: ident.mode });
  return { ok: true, proposals, saved: null, mode: ident.mode };
}

async function saveTailored(state, msg) {
  const text = String(msg?.posting?.text || '').trim();
  if (!state.cv || !text) return { ok: false, kind: 'expired' };
  const key = tailorKey(state, text);
  const hit = await cachedAnalysis(key);
  if (!hit?.changes) return { ok: false, kind: 'expired' };
  const chosen = new Set((Array.isArray(msg.accept) ? msg.accept : []).map(Number));
  const offered = new Set(hit.proposals.map((p) => p.i));
  const picked = hit.changes.filter((_, i) => chosen.has(i) && offered.has(i));
  const { cv, applied } = applyRewrite(state.cv, picked);
  if (!applied.length) return { ok: false, kind: 'none-chosen' };

  const target = [msg.posting?.organisation, msg.posting?.title]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' · ');
  const label = (
    chrome.i18n?.getMessage?.('tailored_label', [target || new URL(msg.url || SITE).host]) || target
  ).slice(0, 120);
  const saved = await saveCv({
    // Saving again after changing the ticks updates the CV this advert already made.
    id: hit.saved?.cv_id && (state.cvs || []).some((c) => c.id === hit.saved.cv_id) ? hit.saved.cv_id : null,
    cv,
    label,
    profile: toProfile(cv),
    source: 'tailored',
    tailored_for: {
      from: state.active_cv_id || null,
      title: String(msg.posting?.title || '').slice(0, 200),
      company: String(msg.posting?.organisation || '').slice(0, 200),
      url: String(msg.url || '').slice(0, 1000),
      at: Date.now(),
    },
    activate: false,
  });
  if (!saved) return { ok: false, kind: 'library-full' };
  const result = { cv_id: saved.saved_id, label, count: applied.length };
  await cacheAnalysis(key, { ...hit, saved: result });
  return { ok: true, ...result };
}

/**
 * What the surfaces may say about the user's allowance, without spending anything.
 *
 * Asked when a panel or the popup opens, never on the fill path. It resolves an identity,
 * which for an anonymous user means opening their session: acceptable here and not on
 * install, because they have opened a page with a job advert on it and are about to be
 * offered an analysis.
 */
async function tier(state) {
  // Without a paired account there is no AI to meter, so nothing to ask the server: the
  // answer is local and opens no session. The same without the user's consent, where asked.
  const refused = await aiRefusal(state);
  if (refused)
    return {
      mode: 'none',
      ai: false,
      consent: refused.kind === 'consent',
      stale: Boolean(state?.stale),
      paid: false,
      tier: null,
      rate_limited: false,
      reset_seconds: null,
    };
  return { ...(await entitlement(state.jwt, 'account')), ai: true };
}

/** Listen for the site. Called once by the core worker; without it the site cannot reach us. */
export function installEpimoni() {
  // Absent where the browser has no `externally_connectable`; the bridge covers it there.
  chrome.runtime.onMessageExternal?.addListener(onExternal);
}

/**
 * What the surfaces may say about the account, merged into the core `state` answer. Decided
 * here, the same way the analysis decides it: a surface that computed this itself would
 * eventually disagree with the code that spends the quota.
 */
export async function epimoniState(state) {
  const refused = await aiRefusal(state);
  return {
    paired: !!state.paired,
    // Whether the AI features are available: a paired account with a live token, and the
    // user's consent where the browser asks for it.
    ai: !refused,
    // The one step left is the browser's consent (Firefox): a surface offers to ask for it.
    consent: refused?.kind === 'consent',
    mode: state.jwt && !state.stale ? 'account' : 'none',
    paired_at: state.paired_at || null,
    // The 31-day token expired. Filling still works from the local profile, and the analysis
    // falls through to the anonymous tier, so this is a prompt to reconnect rather than a
    // broken extension.
    stale: !!state.stale,
  };
}

/** Everything cached about the account goes when the user forgets their data. */
export async function forgetEpimoni() {
  await forgetEntitlement();
}

/**
 * The add-on's messages. Returns `undefined` for a message it does not own, so the core
 * worker can answer "unknown" without knowing what the add-on handles.
 */
export async function handleEpimoni(msg, state, sender) {
  switch (msg?.type) {
    case 'site':
      return fromBridge(msg, sender);
    case 'consent:open':
      // The grant has to be asked inside a click on an extension page, which neither the
      // panel nor the worker is: this opens the one that asks.
      await chrome.tabs.create({ url: chrome.runtime.getURL('src/epimoni/allow.html') });
      return { ok: true };
    case 'consent:missing':
      return { ok: true, missing: await missing(AI_DATA) };
    case 'tier':
      return tier(state);
    case 'analyse':
      return analyse(state, msg);
    case 'letter':
      return letter(state, msg);
    case 'tailor':
      return tailorCv(state, msg);
    case 'tailor:save':
      // The page the CV is for is the tab that asked, never an address the message names.
      return saveTailored(state, { ...msg, url: sender?.tab?.url || sender?.url || '' });
    case 'pair:pending':
    case 'pair:accept':
    case 'pair:refuse':
      return pairingDecision(msg);
    case 'unpair':
      // Disconnect the account, keep the CV: two different requests that used to be one
      // button. See `unpairOnly` in shared/store.js.
      await unpairOnly();
      await forgetEntitlement();
      return { ok: true };
    case 'report':
      // Telemetry rides on a token we already hold and never opens a session of its own:
      // reporting that a form was filled is not a reason to create an account row for
      // somebody who has asked for nothing. An anonymous user who never runs an analysis
      // therefore sends nothing, which is the right default and a real gap in the numbers.
      await track(state.jwt || state.anon?.jwt || null, msg.name, msg.meta || {});
      return { ok: true };
    default:
      return undefined;
  }
}
