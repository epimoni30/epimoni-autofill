# Security

## Reporting a vulnerability

Use whichever channel suits you:

- GitHub private vulnerability reporting: open the Security tab of this repository and click
  "Report a vulnerability". The thread stays private until an advisory is published.
- Email contact.epimoni30@gmail.com with `security` in the subject line. Just say so if you'd
  rather not use GitHub.

Please don't open a public issue for anything exploitable. This extension can read the page
you're applying from, so problems with it are worth sorting out quietly first.

You should hear back within a few days. We're a small team, so please give us a reasonable
amount of time before you disclose anything.

## Supported versions

Only the latest release gets security fixes, and the stores update installed copies on their
own within a day or two. If you're on an older version, please check the latest one before
reporting.

## Scope

Everything in this repository is in scope:

- the content script (`src/content/`), which runs on job board pages;
- the service worker (`src/background/`) and the Epimoni add-on it loads (`src/epimoni/`),
  which is the only code that holds a token or reaches the network;
- the pairing listener (`externally_connectable`), which accepts messages from one origin, and
  the confirmation page that goes with it (`src/epimoni/pair.html`);
- storage (`src/shared/store.js`) and the build (`build.mjs`).

The backend is out of scope. The API this extension talks to isn't in this repository and
isn't open source, so please don't probe, fuzz or load-test it. If something looks like a
server-side problem, report it privately and describe what you saw, but don't go digging.

The job boards themselves are out of scope too, as is anything that needs a compromised browser
or a malicious extension installed next to this one.

## Things that are intentional

People have reported these before. They work as designed:

- No broad host permission is granted at install. On a site the extension doesn't list,
  clicking the toolbar icon grants `activeTab` for that one tab, one time. That's how it handles
  ATS pages nobody could list in advance. `https://*/*` and `http://*/*` are *optional*
  permissions: Chrome asks for them only when you turn on automatic filling for a site, or the
  "Remplir avec Epimoni" button on every site, and you can take them back from the dashboard or
  from Chrome's own extension settings.
- The content script has no token and never calls `fetch`. All network calls happen in the
  service worker, so a hostile page can't use us to reach the API.
- There's a dev-only message type, `epimoni:devfill`. It does nothing in a shipped build: it
  only runs when `EPIMONI_DEV` is true, `build.mjs` sets that to `false` for production, and
  both the release workflow and `npm run package` refuse to ship a build where it isn't.
- The site can't pair the extension on its own. A pairing request from www.epimoni30.com is
  checked with our server, then waits on an extension page until the user accepts it. If you
  find a way for a web page to change the connected account or the CV library without that
  click, please report it.
- The extension never submits a form or ticks a checkbox. If you find a way for it to do
  either, that's a real bug and a serious one, so please tell us.

## Defenses worth knowing about

If you're looking for a way in, these are the walls you'll hit. Breaking any of them is a
valid report.

- Clickjacking. Our in-page panel and button take a click only when it's trusted, the UI has
  been on screen for half a second, and nothing has faded, filtered, clipped or covered it
  (`src/content/clickguard.js`; Chromium's IntersectionObserver v2 plus our own checks for
  Firefox). This is the DOM-based extension clickjacking attack shown against password managers
  at DEF CON 33, and `test/e2e.mjs` replays it.
- Hidden fields. A field the user can't see (zero opacity, off screen, clipped) is never filled,
  so a page can't harvest the CV through invisible inputs.
- Content Security Policy. Extension pages and the service worker may connect to the API origin
  and nowhere else, run only their own scripts, can't be framed and can't post forms. The build
  refuses a policy that doesn't allow the API the code actually calls, or that loosens
  `script-src` or `object-src`.
- Untrusted files. The PDF reader and the JSON Résumé import are fuzzed on every pull request
  and more deeply every week (`test/fuzz.test.js`): mutated real PDFs, arbitrary bytes and
  arbitrary JSON must never throw, hang or return the wrong shape. A crashing input is a
  valid report.
- Messages. The worker answers a content script only for a short list of message types, and the
  site's pairing request must be confirmed by a real click on an extension page.

## Verifying a release

Each GitHub release carries the Chrome and Firefox zips, a `SHA256SUMS` file, and a signed
build provenance attestation, also attached as files (`.sigstore.json`, `.intoto.jsonl`) so it
can be checked offline. To check that a zip was built by this repository's release
workflow from the tagged source:

```bash
sha256sum -c SHA256SUMS
gh attestation verify epimoni-autofill-v0.3.0.zip --repo epimoni30/epimoni-autofill
```

The code isn't minified, so you can also unzip the store package and diff it against
`npm run build` at the same tag.
