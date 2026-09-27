# Pairing: the vitrine → extension hand-off

The extension holds no credentials of its own and fetches no CV. At pairing the site sends
both. This is the whole contract.

## Why a hand-off and not a fetch

The obvious design is for the extension to fetch the CV itself. It was measured against a real
account and rejected, for three reasons that compound:

- Discovery takes several round trips. There is no single "the user's CV" endpoint: the
  builder's current document and a designated master CV can each be absent, so finding one
  means asking for both and then falling back to a list.
- The list route is heavy. Rows carry base64-rendered PDF pages, so it answers in hundreds
  of kilobytes, on a cold Lambda, seconds, to deliver a few fields the site already has.
- It can still come back empty, because an account with several CVs need never have marked
  one as master. The chain's slowest path is also its least conclusive.

The site already has the CV loaded, and is the only surface that can ask *which* CV. So it
computes the profile and hands it over. The extension then calls no CV endpoint at all, which
also keeps it clear of every metered route.

## Two transports, one set of rules

The site reaches the extension in one of two ways, and the worker applies the same rules to
both (`fromSite` in `src/epimoni/worker.js`):

- **The bridge**, preferred, every browser. `src/epimoni/bridge.js` is a content script on
  `https://www.epimoni30.com/*`, top frame only. It marks `<html data-epimoni-bridge>` at
  `document_start` so the site knows there is something to ask, then relays
  `window.postMessage({epimoni: 'request', id, msg})` to the worker and posts back
  `{epimoni: 'response', id, res}`. It forwards `epimoni:ping`, `epimoni:pair` and
  `epimoni:pair-status` and nothing else. It needs no extension id, which is why it works
  unchanged for a store build, an unpacked build on any machine, and Firefox, which has no
  `externally_connectable` at all.
- **`externally_connectable`**, Chrome only, kept for the site as deployed today, which pings
  the ids in `EXTENSION_IDS`. It can go once every live site build prefers the bridge.

Either way the browser, not the message, says where a request came from: `sender.origin`
(or the URL's origin on Firefox) must be the site, and it must come from a tab, top frame
for the bridge. A script on the site can use either transport; that is exactly why a pairing
is a request the user confirms rather than an order.

## The message

The same body travels as `msg` in a bridge request, or as the message itself externally:

```js
chrome.runtime.sendMessage(EXTENSION_ID, {
  type: 'epimoni:pair',
  jwt, user_id, user_type,        // named accounts only, see below
  given_name, family_name,        // from the Google ID token when present
  profile,                        // the flat canonical profile (optional: derived from cv)
  cv,                             // the CvDoc, the offer analysis needs the document
  builder_id, cv_label,           // which document, and what the popup calls it
  taken_at: Date.now(),
}, (res) => { /* { ok: true, mode: 'confirm', id }: nothing is stored yet */ });
```

Nothing is stored on receipt. The extension verifies the token with `/users/me`, opens its
own confirmation page, and applies the request only when the user clicks Accept there. See
"The site asks; the user decides" in `ARCHITECTURE.md` for why.

The site follows the outcome by id:

```js
chrome.runtime.sendMessage(EXTENSION_ID, { type: 'epimoni:pair-status', id },
  (res) => { /* res.status: 'pending' | 'accepted' | 'refused' | 'expired'; res.mode when settled */ });
```

Refusals on the request itself: `busy` (another request is waiting), `cooldown` (the user just
declined one), `unverified` (the server does not recognise the token, or names someone else),
`network` (the check could not be made, and pairing fails closed), `incomplete` (no usable CV).

`{ type: 'epimoni:ping' }` answers `{ ok: true, version }` and is how the site detects whether
the extension is installed. No response (or a `runtime.lastError`) means it is not.

## A named account hands over its session; an anonymous visitor only their CV

The site opens an anonymous session for every visitor before its first API call, so a visitor
who has never signed in still has a `jwt` and a `user_id`. That token is disposable by design,
replaced whenever localStorage is cleared and attached to nobody who could later revoke it, and
the extension keeps what it is handed for 31 days, so it is never sent (`hasNamedAccount()` on
the site) and never kept (the worker drops it). Their CV still crosses: it is their own document
going into their own browser.

The worker decides which kind a request is from the *server's* record of the token, not from
the message's `user_type`: an anonymous session behind a message that claims `google` is
treated as CV-only.

## Send an allowlist, never the session object

For a Google login, `localStorage.user` is the entire Google ID-token payload spread over
our own fields. We checked on the live site: `iss, azp, aud, nonce, nbf, jti, picture, email_verified, iat,
exp, name, given_name, family_name` alongside `user_id, user_type, jwt`. Spreading it into the
message would copy Google's token internals into extension storage for no purpose, which is
exactly what the Chrome Web Store limited-use policy is about. The service worker keeps only
the fields `sanitizePairing` names, but the site should not send more than that either.

Two further notes:
- Read `localStorage.user`, not `user-pro`: the pro console keeps a separate session.
- `given_name` / `family_name` from Google replace the naive last-space split for every
  Google-logged-in user. `splitName()` stays as the anonymous-session fallback.
