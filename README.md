# Epimoni Autofill

[![check](https://github.com/epimoni30/epimoni-autofill/actions/workflows/check.yml/badge.svg)](https://github.com/epimoni30/epimoni-autofill/actions/workflows/check.yml)
[![Licence: Apache-2.0](https://img.shields.io/badge/licence-Apache--2.0-blue)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Runtime dependencies: 0](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)](package.json)
[![Code style: Biome](https://img.shields.io/badge/code%20style-Biome-60a5fa?logo=biome&logoColor=white)](https://biomejs.dev)

A Chrome extension that fills in job application forms from your CV. We started with the
French job boards (France Travail, HelloWork, APEC, Welcome to the Jungle, Indeed.fr and
LinkedIn) and the ATS pages they send you to.

You can [try it in your browser](https://epimoni30.github.io/epimoni-autofill/) without
installing anything. The playground runs the real engine on our test forms: write a CV, press
Fill, and it shows you how each field scored against the expected answer, traps included.

It fills forms. It never submits them. No code in this extension clicks a submit button, and
none ever will, because you should read every field before anything goes out. Password and
payment fields are always refused, and so is any field in a form that contains a password,
since a login box on a careers page usually has a perfectly ordinary email field next to it.
Checkboxes are never touched. On an application form a lone checkbox is almost always a
consent box, and consent is yours to give.

## What works with nothing at all

Filling is deterministic and local. The extension knows a set of fields (your contact details,
your experience, your education and the other CV sections, block by block) and fills them with
no account, no token and no network call. It is instant, it has no quota, and it works the same
in a fork as in the published extension.

Everything that talks to Epimoni lives in one folder, `src/epimoni/`. No core module imports it,
and a test fails the build if one ever does.

## Adding to it

The CV underneath is the open [JSON Résumé](https://jsonresume.org/schema) format, and every
question the extension can answer is defined once, in `src/schema/fields.js`. From there:

- a new language is one file, `src/lexicon/<lang>.js`, copied from `_template.js`;
- a new job board or ATS is usually a few phrases in a language pack, and at most a small
  *site filler* that reads its markup;
- a custom control, like a design system's dropdown or a date picker, gets a *widget filler*.

Fillers can add evidence and operate widgets through a guarded API, but they never decide what
goes in a field. The build rejects any filler that could click a submit button, tick a box or
reach the network. [CONTRIBUTING.md](CONTRIBUTING.md) has the recipes and
[ARCHITECTURE.md](ARCHITECTURE.md) explains why things are the way they are.

## The part that needs our server

Comparing your CV with the job advert on the page is done by Epimoni's API. That backend is
closed source and isn't in this repository, so a fork gets form filling and the CV editor but
not the analysis. If you want it, use the published extension or point `API` in
`src/epimoni/api.js` at a server of your own.

To ship the core on its own, delete `src/epimoni/` and replace its single import in
`src/background/index.js` with the four no-op functions that `test/boundary.test.mjs` uses. That
test already runs the core worker this way, with the network switched off.

## Your data

- Your CV is kept in `chrome.storage.local`, in your browser. Installing the extension uploads
  nothing.
- Page content only leaves your browser when you ask for an analysis. Opening a page sends
  nothing.
- A CV can come from the Epimoni site, from a `resume.json` file, or from the extension's own
  CV page. You don't need an Epimoni account.
- Connecting to the site always goes through a confirmation page inside the extension. The site
  can ask, but only you can accept.
- If you are not signed in on the site, its session token is never taken. The extension opens
  its own session at your first analysis and keeps it for 31 days at most.

[PRIVACY.md](PRIVACY.md) has the full details, including what the usage statistics contain.

## Building it

There's no bundler, no framework and no runtime dependency. `build.mjs` concatenates the ES
modules into the two scripts Chrome loads.

```bash
npm install          # Playwright, for the tests; the extension itself has no dependencies
npm run build        # writes dist/
```

Then open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and pick `dist/`.

> Heads up: `npm run check` leaves a dev build in `dist/`. Its last step builds with `--dev`,
> which grants localhost access and auto-runs on the test pages. Run `npm run build` again
> before you use it for anything other than testing.

```bash
npm test             # unit tests: resolver, pairing, CV model, storage, identity, extraction
npm run measure      # fill rate and wrong-fill rate on annotated test pages
npm run e2e          # drives the built extension in a real headless Chromium
npm run lint         # Biome, check only
npm run format       # Biome, apply formatting and safe fixes
npm run check        # lint, then all of the above
npm run package      # production build, zipped for the Chrome Web Store
npm run playground:serve  # the playground on localhost, from your working tree
```

`measure` is the one to keep an eye on. In `test/fixtures/traps.html` every single control has
to be left alone. A wrong value in a job application can't be taken back, while a missed field
costs you a few keystrokes. Pretty much every decision in here follows from that.

## JSON Résumé

The CV is real JSON Résumé, not something that merely looks like it. `toJsonResume` and
`fromJsonResume` in `src/shared/cvdoc.js` sit at the boundary, so an exported file opens in any
JSON Résumé theme and anyone's `resume.json` imports as is.

## Further reading

| | |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | why the code looks the way it does (most of it started as a bug). Read it before editing. |
| [docs/pairing.md](docs/pairing.md) | how the site hands a CV to the extension, and why it isn't a fetch |
| [CONTRIBUTING.md](CONTRIBUTING.md) | getting set up, and what we will and won't merge |
| [CHANGELOG.md](CHANGELOG.md) | what changed in each version |
| [PRIVACY.md](PRIVACY.md) | what is stored, what is sent, and when |
| [store/listing.md](store/listing.md) | the Chrome Web Store text, permission justifications and data disclosures |
| [SECURITY.md](SECURITY.md) | reporting a vulnerability |
| [TRADEMARK.md](TRADEMARK.md) | the code is Apache-2.0, the Epimoni name and logo are not |

## Contact

Bugs and feature requests go in [GitHub issues](https://github.com/epimoni30/epimoni-autofill/issues).
Contributions are welcome; [CONTRIBUTING.md](CONTRIBUTING.md) is the place to start, and everyone
taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). For anything security related,
please follow [SECURITY.md](SECURITY.md) rather than opening a public issue. For everything
else, write to contact.epimoni30@gmail.com.

## Licence

[Apache-2.0](LICENSE). The licence doesn't cover the Epimoni name or logo, so a fork has to
replace them before it's published. See [TRADEMARK.md](TRADEMARK.md).

## Sponsor

Epimoni Autofill is sponsored by [Epimoni](https://www.epimoni30.com), which pays for its
development and runs the API behind the offer analysis. Epimoni makes AI career tools for
French-speaking job seekers: CV analysis, cover letters, interview practice and salary
negotiation. If the extension saves you time, [epimoni30.com](https://www.epimoni30.com) is the
best way to support it.
