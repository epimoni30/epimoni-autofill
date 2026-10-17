// What a paired account's token is allowed to do.
//
// The AI features belong to an Epimoni account paired from the site. Paying customers are
// not metered at all; a free account gets one model-backed call an hour, the same window as
// the website. Without a paired account there is no AI, so there is nothing here to ask:
// the worker refuses before any of this runs, and no session is ever opened on somebody's
// behalf.
//
// Deterministic filling needs none of it: it makes no network call, so it needs no token
// and is never metered. Nothing in this file is on the fill path.

import { getMe } from './api.js';

const TIER_KEY = 'entitlement';
// Long enough that opening the panel on five adverts in a row costs one call, short enough
// that somebody who has just paid sees it inside a minute or two.
const TIER_TTL_MS = 5 * 60 * 1000;

/**
 * Is this person metered, and are they out of window right now.
 *
 * Read before the analysis is offered, so the panel can say "1 analyse par heure" to a free
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
    tier: 'unknown',
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
    await chrome.storage.session.remove(`${TIER_KEY}:account`);
  } catch {
    /* fine */
  }
}
