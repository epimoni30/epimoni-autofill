// The backend, from the service worker.
//
// Only the worker calls this. A service-worker fetch covered by `host_permissions` is not
// subject to CORS, so the backend needs no new allowed origin; a content-script fetch would
// need one, and Starlette matches origins by exact string, so `chrome-extension://…` could
// not be allowed anyway. That is why the content script holds neither the token nor a fetch.

export const API = 'https://fpd66hmugz4o7j6g7t4obpxlca0bgrvk.lambda-url.eu-central-1.on.aws';

/**
 * The statuses this API answers with, named, because each one means something different to
 * the person looking at the panel:
 *
 *   401  the 31-day token has expired or been invalidated → reconnect, and keep filling
 *   429  the free hourly window is spent → the paywall, with the wait in `detail`
 *   422  the agent refused an over-budget prompt → the advert is too long, not a fault
 *   502  the comparison assessed nothing and was refused rather than scored 0 → retry
 *
 * Anything else is an ordinary failure and says so.
 */
export async function apiFetch(jwt, path, { method = 'GET', body = null } = {}) {
  if (!jwt) return { ok: false, kind: 'unpaired' };

  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-type': 'application/json', 'Access-Token': jwt },
      body: body === null ? undefined : JSON.stringify(body),
    });
  } catch {
    // Offline, DNS, a cold Lambda that timed out. Nothing the user did.
    return { ok: false, kind: 'network' };
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* an error body is not always JSON */
  }

  if (response.ok) return { ok: true, data };
  if (response.status === 401) return { ok: false, kind: 'expired' };
  if (response.status === 429) {
    // `detail` is the seconds until the window resets, as a string.
    const seconds = Number(data?.detail);
    return { ok: false, kind: 'quota', seconds: Number.isFinite(seconds) ? seconds : null };
  }
  if (response.status === 422) return { ok: false, kind: 'too-long', detail: data?.detail || null };
  // `scoring_empty`: the evidence gate dropped every criterion, so there is no comparison.
  // The backend refuses it rather than returning the `global_score: 0` that an empty
  // `section_scores` computes to, and the rate limiter gives the hour back when a handler
  // raises, so retrying immediately is free. It is a distinct status rather than a generic
  // failure because "we assessed nothing" and "we assessed you at zero" must never render
  // the same way: one is a retry, the other is an answer.
  if (response.status === 502 && data?.detail === 'scoring_empty') return { ok: false, kind: 'empty' };
  return { ok: false, kind: 'failed', status: response.status };
}

/**
 * Open a session with no account behind it: the same one the website opens for every
 * visitor before its first API call.
 *
 * This is what makes the extension usable by somebody who has never signed in. The session
 * is metered exactly like the site's free tier (one model-backed call an hour), so an
 * anonymous user of the extension gets the same deal as an anonymous user of the site, not a
 * loophole, and not a second free allowance either, since both surfaces draw on one window.
 *
 * `Access-Token` is sent when we already hold one: the backend hands the *same* identity
 * back rather than minting a second. A visitor split across two anonymous identities loses
 * whatever the first one owned, and the worker is killed every thirty seconds and asks again
 * on each wake, so without this it would split itself.
 */
export async function anonymousLogin(existing = null) {
  try {
    const headers = { 'Content-type': 'application/json' };
    if (existing) headers['Access-Token'] = existing;
    const response = await fetch(`${API}/api/v1/users/anonymous-login`, { method: 'POST', headers });
    if (!response.ok)
      return { ok: false, kind: response.status === 429 ? 'quota' : 'failed', status: response.status };
    const data = await response.json();
    if (!data?.jwt || !data?.user_id) return { ok: false, kind: 'failed' };
    return { ok: true, jwt: data.jwt, user_id: data.user_id };
  } catch {
    return { ok: false, kind: 'network' };
  }
}

/**
 * Who this token belongs to, and what it is allowed to do.
 *
 * `preference.account_type` is `gratuit | starter | premium | admin`, and `rate_limit` is
 * computed server-side, which answers `{rate_limited: false}` outright for a
 * paying customer or an admin, because they are never metered. So one unmetered GET answers
 * both questions the surfaces ask: may this person analyse right now, and are they on a plan
 * where the question never arises.
 */
export async function getMe(jwt) {
  const res = await apiFetch(jwt, '/api/v1/users/me');
  if (!res.ok) return res;
  const me = res.data || {};
  const tier = String(me.user?.preference?.account_type || 'gratuit');
  const limit = me.rate_limit || {};
  return {
    ok: true,
    tier,
    // `gratuit` is the only tier that is metered; admin is not a plan anyone buys but it is
    // not metered either, and treating it as paid here keeps the surfaces honest for us.
    paid: tier !== 'gratuit',
    rate_limited: !!limit.rate_limited,
    reset_seconds: Number.isFinite(Number(limit.reset_time_seconds))
      ? Number(limit.reset_time_seconds)
      : null,
  };
}

/**
 * Whose token this is, according to the server: the answer a pairing request is checked
 * against. The message's own `user_id` and names are claims; this is not.
 *
 * `anonymous` is read from the server's record rather than from the message's `user_type`,
 * which the sender chooses: the site's anonymous sessions carry a generated
 * `anonymous_<uuid>@example.com` address.
 */
export async function whoIs(jwt) {
  const res = await apiFetch(jwt, '/api/v1/users/me');
  if (!res.ok) return res;
  const me = res.data || {};
  const userId = me.user_id ?? me.user?.user_id ?? null;
  const email = me.user?.email ?? me.email ?? null;
  if (typeof userId !== 'string' || !userId) return { ok: false, kind: 'failed' };
  return {
    ok: true,
    user_id: userId,
    email: typeof email === 'string' ? email : null,
    anonymous: typeof email !== 'string' || /^anonymous_[^@]*@example\.com$/i.test(email),
  };
}
