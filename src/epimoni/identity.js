// Which token an AI call goes out with, and what that token is allowed to do.
//
// The extension has two kinds of user and must work for both:
//
//   account    paired from the site, a named Epimoni login. Paying customers are not
//              metered at all, so the offer analysis is unlimited for them.
//   anonymous  never signed in. The worker opens its own session against
//              `/users/anonymous-login` and is metered on the free tier: one model-backed
//              call an hour, the same window as the website.
//
// Deterministic filling belongs to neither: it makes no network call, so it needs no
// identity and is never metered. Nothing in this file is on the fill path.
//
// The one rule that shapes the code: **an identity is resolved only when a metered call is
// about to happen.** Minting a session on install would create an account row for every
// person who merely installed the extension, and would do it before they had asked for
// anything.

import { anonymousLogin, getMe } from './api.js';
import { read, write } from '../shared/store.js';

/**
 * The anonymous session is re-minted rather than kept forever.
 *
 * The JWT itself lasts 31 days, and the backend hands the same identity
 * back for as long as it is valid, so this is not an expiry: it is a ceiling on how long
 * one anonymous identity accumulates history on our side for somebody who never asked for
 * an account.
 */
const ANON_MAX_AGE_MS = 31 * 24 * 60 * 60 * 1000;

// Two clicks a second apart must not open two sessions. Module scope is enough: the worker
// dies after ~30 s idle, and the case this guards is entirely inside one wake.
let inFlight = null;

/**
 * The anonymous session, reused when we have one and minted when we do not.
 *
 * The token we already hold is sent along: the backend answers with the *same* identity if
 * it is still valid, which is what stops a visitor being split across two anonymous users
 * and losing what the first one owned.
 */
export async function anonymousIdentity(state, { force = false, mint = true } = {}) {
  const held = state.anon && typeof state.anon === 'object' ? state.anon : null;
  const fresh = held?.jwt && held.at && Date.now() - held.at < ANON_MAX_AGE_MS;
  if (fresh && !force) return { ok: true, jwt: held.jwt, user_id: held.user_id, mode: 'anonymous' };
  // A caller that only wants to *read* (the tier shown in the popup and the panel) gets no
  // session rather than a new one: opening the popup is not a metered call, and minting here
  // made every install that was merely opened an account row on our side.
  if (!mint) return { ok: false, kind: 'no-session', mode: 'anonymous' };

  if (!inFlight) {
    inFlight = (async () => {
      // On a forced refresh the held token is the thing that just failed, so it is not
      // offered back: sending it would only invite the same answer.
      const res = await anonymousLogin(force ? null : held?.jwt || null);
      if (res.ok) await write({ anon: { jwt: res.jwt, user_id: res.user_id, at: Date.now() } });
      return res;
    })().finally(() => {
      inFlight = null;
    });
  }
  const res = await inFlight;
  return res.ok ? { ok: true, jwt: res.jwt, user_id: res.user_id, mode: 'anonymous' } : res;
}

/**
 * The token to spend, and which kind it is.
 *
 * A stale account token falls through to the anonymous path rather than failing: the user
 * still gets their answer, metered, and the surfaces say so: `stale` is already surfaced in
 * the popup and the panel with a reconnect link. Refusing outright would make an expired
 * 31-day token look like a broken extension.
 */
export async function resolveIdentity(state, { force = false, mint = true } = {}) {
  if (state.jwt && !state.stale && !force) return { ok: true, jwt: state.jwt, mode: 'account' };
  return anonymousIdentity(state, { force, mint });
}

const TIER_KEY = 'entitlement';
// Long enough that opening the panel on five adverts in a row costs one call, short enough
// that somebody who has just paid sees it inside a minute or two.
const TIER_TTL_MS = 5 * 60 * 1000;

/**
 * Is this person metered, and are they out of window right now.
 *
 * Read before the analysis is offered, so the panel can say "2 analyses par heure" to a free
 * user and nothing at all to a paying one. `/users/me` is unmetered, it carries no
 * rate-limit dependency and only reads the window, never spends it,
 * so asking is free. Cached anyway, because it is asked once per panel and the answer does
 * not move.
 *
 * Every failure answers "metered, and we do not know the window": the honest default when we
 * cannot tell is the one that promises the user less, not more.
 */
export async function entitlement(jwt, mode, { fresh = false } = {}) {
  const unknown = {
    tier: mode === 'account' ? 'unknown' : 'gratuit',
    paid: false,
    rate_limited: false,
    reset_seconds: null,
    mode,
  };
  if (!jwt) return unknown;

  const cacheKey = `${TIER_KEY}:${mode}`;
  if (!fresh) {
    try {
      const bag = await chrome.storage.session.get(cacheKey);
      const hit = bag[cacheKey];
      if (hit && Date.now() - hit.at < TIER_TTL_MS) return hit.value;
    } catch {
      /* no session storage: ask again, it is one unmetered GET */
    }
  }

  const me = await getMe(jwt);
  if (!me.ok) return unknown;
  const value = {
    tier: me.tier,
    paid: me.paid,
    rate_limited: me.rate_limited,
    reset_seconds: me.reset_seconds,
    mode,
  };
  try {
    await chrome.storage.session.set({ [cacheKey]: { at: Date.now(), value } });
  } catch {
    /* fine */
  }
  return value;
}

/** Drop the cached entitlement: after a pairing, an unpair, or a 429 that moves the window. */
export async function forgetEntitlement() {
  try {
    await chrome.storage.session.remove([`${TIER_KEY}:account`, `${TIER_KEY}:anonymous`]);
  } catch {
    /* fine */
  }
}

/** Read-only convenience for surfaces that only need to know which half they are in. */
export async function currentMode() {
  const state = await read();
  return state.jwt && !state.stale ? 'account' : 'anonymous';
}
