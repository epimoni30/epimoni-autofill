# Contributing

Thanks for stopping by. This is a small project, and one rule matters more than all the
others, so please read this page before you open a pull request.

## The rule

A wrong fill is worse than a missed one. A missed field costs the user one keystroke. A
wrong value in a submitted job application cannot be taken back, and the user may not notice
it before pressing Submit. Every change is judged against that asymmetry, and CI enforces it:
`test/fixtures/traps.html` is a page on which every control must be left alone, and
`npm run measure` fails on a single wrong fill.

So a change that fills more fields but costs one wrong fill will not be merged, however good
the rest of it is.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before editing code. It explains why the code is shaped
the way it is, and most of those explanations started as a bug.

## Setup

Node 20 or later.

```bash
npm ci
npx playwright install chromium   # the full Chromium: headless-shell cannot load extensions
npm run check                     # lint, unit tests, fill measurement, build, end-to-end
```

`npm run check` is what CI runs, and a pull request needs it green. It leaves a dev build in
`dist/`, so run `npm run build` before loading the extension unpacked for anything but a test.

Formatting and lint are [Biome](https://biomejs.dev): `npm run format` fixes what can be fixed
automatically, and `npm run lint` checks without writing. You don't need to format anything by hand.

## What we are glad to receive

- A field the extension missed. Most of these are a phrase missing from a language pack:
  `src/lexicon/<lang>.js`. Each key has `any` (phrases that match it) and `not` (phrases
  that rule it out). Phrases are written lowercase and without accents, because labels are
  normalised before matching. Add a `not` for anything your new phrase could plausibly
  mis-read, then run `npm run measure`. A key named `work.company` is *scoped*: it only
  exists inside a block of that CV section, and the section itself is recognised from a heading
  listed under `sections` (matched exactly) or from a form's own ids (`attr`, in `en.js`).
- A field the extension filled wrongly. Honestly, this is the most useful report you can send. If you
  can, add the control to a fixture with the right `data-expect`, or to `traps.html` with
  `data-expect="none"`, so it stays fixed.
- A new job board or ATS. Add a *reduced* fixture under `test/fixtures/`: the form's markup,
  hand-trimmed, and nothing else. Do not commit a raw capture of a live page, since it carries
  third-party markup and sometimes personal data. `npm run probe` keeps real captures in
  `test/fixtures/postings/.private/`, which is ignored for that reason. Most boards need only
  phrases; see the recipes below for when a filler is worth it.

  A fixture listed in `test/fixture-list.mjs` (or any filler's own page, which is found on its
  own) is measured in CI and shows up in the [playground](https://epimoni30.github.io/epimoni-autofill/)
  once merged. `npm run playground:serve` shows you what visitors will see.

## Recipes: your language, your job board, your widget

The CV format underneath everything is [JSON Résumé](https://jsonresume.org/schema). The list
of questions the extension can answer is `src/schema/fields.js`; everything below plugs into it.

### Add your language or country

1. Copy `src/lexicon/_template.js` to `src/lexicon/<lang>.js` (`de.js`, `it.js`, `pt.js`…) and
   set `lang`. Every field and section is already listed; fill in only what you are sure of.
2. Add one import line to `src/lexicon/index.js`.
3. Fill `dates.months` and `dates.ongoing` too: they teach the CV's date parser your language,
   so "März 2021" and "heute" read correctly.
4. Add a fixture page in your language under `test/fixtures/` with `data-expect` on every
   control, including at least one field that must stay empty (`data-expect="none"`).
5. `npm run check`. The build tells you, by file and phrase, anything it does not accept.

The panel's own text is separate: `_locales/<lang>/messages.json`, a Chrome i18n catalogue.

### Add a job board or ATS (a site filler)

First try phrases alone: most boards only need their labels in a pack. Write a filler when the
page can't be read without knowing the site: stable ids that say more than the labels, numbered
rows, or a control the native scan can't see.

1. Copy `src/fillers/_template.site.js` to `src/fillers/site/<id>.js`; list it in
   `src/fillers/index.js`.
2. Implement the fewest hooks that work. `describe` and `hint` are evidence; the core still
   decides every field. `src/fillers/site/workday.js` is a complete example that writes nothing.
3. Add `test/fixtures/fillers/<id>/` with a reduced page and at least one trap, meaning a field
   your evidence could plausibly mislabel, annotated `data-expect="none"`. The build refuses a
   filler without a fixture directory.
4. `npm run check`. Your filler gets its own line in `npm run measure`; one wrong fill fails it.

### Add a widget (a widget filler)

For a kind of control that is not a native `<select>`/`<input>`, on any site: a date picker, a
tag input, a design system's dropdown.

1. Copy `src/fillers/_template.widget.js` to `src/fillers/widget/<id>.js`; list it in
   `src/fillers/index.js`. `widget/aria-combobox.js` is a complete example.
2. Act only through the `api` your `write` receives. The build rejects `.click(`, `submit`,
   keyboard events, `fetch`, `chrome.`, `innerHTML` and `.checked =` in filler code, and the
   API itself refuses submit buttons, links, checkboxes and anything outside your control.
3. Return `{ ok: true, undo }` so "Tout annuler" can revert your write.
4. The fixture reproduces the widget *controlled*, the way its framework is: the selection in
   state, not only in the DOM. See `test/fixtures/fillers/aria-combobox/combobox.html`.

### Translate the interface

The interface text is in `_locales/{fr,en,es}/messages.json`. Every key has to exist in all
three files; `npm run build` fails otherwise and tells you which one is missing.

## What will not be merged

We decided these on purpose. [SECURITY.md](SECURITY.md) explains several of them.

- Anything that submits a form, clicks a submit control, or ticks a checkbox. On an
  application form a lone checkbox is almost always consent, and consent has to come from the
  person giving it.
- Filling password or payment fields, or any field in a form that contains a password.
- New permissions or new host patterns in `manifest.json` without an issue discussing them
  first. Every permission is something the Chrome Web Store reviews and the user has to trust.
- Runtime dependencies, a bundler or a framework. `build.mjs` concatenates modules, and
  that is deliberate. A dev dependency for tests or tooling is fine if it earns its place.
- Sending field values or page text anywhere. Telemetry carries counts and decisions only.
- Network calls outside `src/epimoni/`, or a core module importing from it. The CV editor
  and form filling are free and work offline; `test/boundary.test.mjs` keeps them that way.

## The backend

The AI tier, which compares the CV with the advert on screen, calls Epimoni's API. It is an
add-on: all of it lives in `src/epimoni/`, and the rest of the extension works without it. That
API is closed source and isn't in this repository. The unit and end-to-end tests stub `fetch`, so
you can change the extension's side of it without a server. Please do not probe or load-test
the production API.

## Pull requests

- For anything beyond a small fix, open an issue first so we can agree on the approach.
- Keep one change per pull request. A formatting-only change goes in its own commit.
- Write commit messages that say *why*, not only what. `git log` has examples.
- Add a line under "Unreleased" in [CHANGELOG.md](CHANGELOG.md) for anything a user would
  notice.

## Licence and brand

By submitting a contribution you agree that it is licensed under
[Apache-2.0](LICENSE), as section 5 of that licence already provides. There is no CLA.

The code is open, but the Epimoni name and the E30 logo are not. See
[TRADEMARK.md](TRADEMARK.md) if you intend to publish a fork.

## Conduct and security

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md), and never in a
public issue.
