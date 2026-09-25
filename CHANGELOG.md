# Changelog

All notable changes to this extension are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version is the one in `manifest.json`, which the Chrome Web Store shows. `package.json`
carries the same number, and the release workflow refuses a tag that does not match both.

## [Unreleased]

## [0.1.0] - Unreleased

First public version. The heading carries the version already, so the release workflow's
notes come from this section when `v0.1.0` is tagged; set the date then.

### Security

- Pairing with the site needs your confirmation. A request from www.epimoni30.com is checked
  against the server and waits on the extension's own page, which shows the account's address,
  until you accept it; no script on the site can pair an account or add a CV on its own.
- Fields you cannot see are never filled: inputs hidden behind a transparent parent, moved off
  the page, or clipped to nothing are left alone.
- A job board's page cannot read the review panel (a closed shadow root) or press its buttons.
- Content scripts can ask only for what filling needs; editing, erasing or listing the CV
  library is for the extension's own pages.

### Added

- Form filling from your CV on France Travail, HelloWork, APEC, Welcome to the Jungle,
  Indeed.fr and LinkedIn, and on other sites when you click the toolbar icon (that tab
  only, through `activeTab`). Shadow DOM and embedded iframes are covered.
- Experience, education, certifications, languages, projects, volunteering, awards,
  publications, interests and references filled block by block, one CV entry per block, with
  dates fitted to the form (month/year dropdowns, `type=month`, the placeholder's format) and
  never made more precise than the CV. "Add another" buttons are never clicked: the panel says
  how many entries are left over, and a second click fills the blocks you add.
- A review panel listing every field touched, so you can check and undo before sending.
  The extension never submits a form, never ticks a checkbox, and refuses password and
  payment fields.
- A CV editor inside the extension, with a library of several CVs and one active. No Epimoni
  account is needed.
- JSON Résumé import and export, including projects, volunteering, awards, publications,
  interests and references.
- Custom dropdowns (WAI-ARIA comboboxes: React-Select, MUI and most design systems) filled and
  undone like native ones.
- Workday: fields named from Workday's own ids, including ones with no visible label.
- Pairing with an Epimoni account from epimoni30.com, which hands over the CV already there.
- Offer analysis: the CV compared against the job advert on screen, on request only, never on
  page load.
- Interface in French, English and Spanish.
- A privacy policy (`PRIVACY.md`, English and French) and the Chrome Web Store listing text,
  permission justifications and data disclosures (`store/listing.md`).

### Fixed

- Once the free analysis for the hour is used, the popup and the panel show "See the plans"
  straight away, not only after a refused click. The link now reaches the plans section of the
  site (`/#pricing`, in the user's language); it used to point at an anchor that did not exist.

- Opening the menu no longer opens a server session for somebody who has never run an
  analysis. Showing the allowance now reuses a session that already exists, and otherwise answers
  "free tier" without a request.
- The review panel's buttons keep their own text colour on sites that style every button, where
  "Undo all" used to render white on white.

### Development

- The free core and the Epimoni add-on are separate folders. Everything that talks to
  epimoni30.com (pairing, the offer analysis, the allowance, usage reporting) lives in
  `src/epimoni/`, reached through one import in the core worker; `test/boundary.test.mjs`
  refuses a core module that imports it or holds a network primitive, and runs the core worker
  with the add-on removed.
- `npm run package` builds the Chrome Web Store zip locally and refuses a dev build.
- A playground on GitHub Pages: write a CV, fill the test forms with the real engine, and see
  every field scored against the form's ground truth. `test/scoring.js` and
  `test/fixture-list.mjs` are now shared by the measurement and the playground, and
  `npm run playground:test` checks the two agree.

- `npm run store` renders the store screenshots and promo tile from the built extension, on a
  styled demo form (`store/demo.html`).

- Extensible by design: every field defined once in `src/schema/fields.js` (JSON Résumé-rooted),
  language packs as one file per language (`src/lexicon/<lang>.js`, with a template), and
  fillers (for sites and for widgets) that add evidence and act only through a guarded API. The build
  validates packs against the registry and refuses filler code that clicks, submits, types keys
  or calls the network. `npm run guard` tests the guard in a real browser.
- One content-script bundler (`tools/bundle.mjs`), shared by the build and the measurement.
- Lint and formatting with Biome, checked in CI.
- Community files: contributing guide, code of conduct, issue and pull request templates.
- Dependabot, CodeQL, and a release workflow that builds the zip from a version tag.

[Unreleased]: https://github.com/epimoni30/epimoni-autofill/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/epimoni30/epimoni-autofill/releases/tag/v0.1.0
