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

- There's no broad host permission. On a site the extension doesn't list, clicking the toolbar
  icon grants `activeTab` for that one tab, one time. That's how it handles ATS pages nobody
  could list in advance. Nothing beyond the listed job boards and the API is requested at
  install.
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
