# Architecture

Epimoni Autofill is a Manifest V3 extension that pre-fills job application forms from a CV you
already hold. It has no dependencies, no bundler and no framework: `build.mjs` concatenates ES
modules into the two scripts Chrome loads.

This is where we explain why the code looks the way it does, and which parts you really
shouldn't break. Most of what's written here started life as a bug.

## Commands

```bash
npm test        # resolver, pairing, CvDoc, storage, identity, extraction, bundler, core/add-on boundary
npm run measure # fill rate / wrong-fill rate against annotated page fixtures, fillers' included
npm run guard   # the guarded API fillers act through, in a real browser
npm run build   # dist/, with manifest + locale + pack + filler + module-import validation
npm run icons   # re-render icons/*.png from the brand mark
npm run store   # store screenshots + promo tile, rendered from the real extension (fr, en)
npm run probe   # visit a real posting on each supported board, report what extraction gets
npm run lint    # Biome format + lint check (CI runs `biome ci`)
npm run format  # apply Biome formatting and safe fixes
npm run check   # lint + test + measure + guard + build + e2e
npm run package # production build → epimoni-autofill-v<version>.zip, refuses a dev build
npm run build:firefox / package:firefox   the same, for Firefox (`build.mjs --target=firefox`)
npm run playground        # build site/, the public playground (playground:serve to open it)
npm run playground:test   # drive the built playground; its verdicts must equal measure's
```

`npm run check` leaves a dev build in `dist/`: its last step is `e2e`, which builds with
`--dev`. Run `npm run build` before loading it as anything but a test.

`npm run e2e` drives the built extension in a real Chromium: 121 checks, headless, a few
seconds. Two things make that work and are easy to undo by accident:

- `channel: 'chromium'`, not `headless: false`. Since Playwright 1.49 the default headless
  browser is `chromium_headless_shell`, which cannot load extensions at all. The full Chromium
  build can, and runs in new-headless mode, so the test opens no window and belongs in CI.
- The dev build grants `http://127.0.0.1/*` and `http://localhost/*` as host permissions,
  not merely as content-script matches. Without host *access* Chrome redacts `tab.url` from
  `tabs.query` and refuses `scripting.executeScript`, so the test cannot find its own fixture
  tab. In production that access comes from the user's click; a test has no user to click.

Playwright is resolved by `tools/chromium.mjs`, which prefers this project's own
`node_modules` and falls back to a sibling `playwright/` checkout, so one browser download can
be shared across a workspace.

## The module map

```
── the free core: no account, no token, no network ─────────────────────────────────────────
src/shared/cvdoc.js     the CV document: read it, write it, flatten it, translate it to JSON Résumé
src/shared/store.js     the CV library and everything else remembered; one writer, one copy
src/shared/files.js     the PDF a user attached to a CV, in the extension's own IndexedDB
src/shared/pdf.js       a CV as a PDF, written by hand: the file sent when the user attached none
src/shared/applications.js  the application tracker: one entry per job page filled, local only
src/background/index.js the core worker: the library, the fill profile, the toolbar click
src/dashboard/          the extension's one page, behind a menu: the CV (cv.js, the only surface
                        that can create one) and the applications (applications.js)
src/content/fill.js     one fill of one page: scan, describe, resolve, write, fillers wired in
src/content/dom.js      finding, describing and writing to controls
src/content/resolve.js  described control → canonical profile key (pure)
src/content/guard.js    the only API a filler acts through
src/content/posting.js  the job advert on the page → text worth analysing
src/content/keywords.js which of the CV's skills the advert names, and marking them in the page
src/schema/fields.js    every canonical field: its shape, and where it lives in JSON Résumé
src/lexicon/<lang>.js   one language pack each: phrases, section headings, dates; index.js lists them
src/fillers/            site and widget fillers: evidence and guarded writers, never decisions
tools/bundle.mjs        ES modules → the content script; enforces the filler contract
platform/               per-browser manifest transforms (chrome, firefox); build.mjs --target=

── the Epimoni add-on: everything that talks to epimoni30.com ──────────────────────────────
src/epimoni/worker.js   pairing with the site, the offer analysis, the allowance, reporting
src/epimoni/identity.js which token a metered call goes out with, and what it may do
src/epimoni/api.js      the backend, named statuses, and the anonymous session
src/epimoni/telemetry.js  counts-only usage events, riding on a token already held
src/epimoni/bridge.js   the site's door on every browser: postMessage ↔ worker, forwards ping/pair/pair-status only
```

Three places define what the engine knows, and each has one job. The registry
(`schema/fields.js`) says which questions exist and what shape their answers take: a field
there is the only way a key comes into being, and the build checks every pack and locale
against it. A language pack says how one language asks those questions. A filler says
what one site or one widget does differently. Adding a country is a pack; adding a job board
is usually a pack's phrases and at most a filler; adding a *field* is the registry first.

## A free core, and Epimoni as an add-on

The product is two things with one line between them. The core is a JSON Résumé editor and a
keyword engine: you write your CV once, and the extension fills application forms from it. It is
free, needs no account, and makes no network call: filling, the CV library and its PDF, the
application tracker and the skills line. The Epimoni add-on is the AI half: scoring the CV
against the advert on screen, writing the cover letter, and handing a CV over from
epimoni30.com. It needs a paired Epimoni account (`aiAllowed`: paired, with a live token),
is metered by the backend, and everything it does lives in `src/epimoni/`. Without an account
the AI buttons are shown disabled, with the link that connects one; no session is opened on
anybody's behalf.

The folder *is* the decision, and three rules keep it one:

- Only the core worker imports the add-on, and only `epimoni/worker.js`, through four exports:
  `installEpimoni` (the site's listener), `handleEpimoni` (the messages it owns: `analyse`,
  `letter`, `tier`, `unpair`, `report`), `epimoniState` (what a surface may say about the account) and
  `forgetEpimoni`. A message the core does not know is offered to the add-on, and one neither
  knows is answered `unknown`.
- The add-on depends on the core, never the reverse. It reads `shared/store.js` and
  `shared/cvdoc.js`; nothing in `shared/`, `content/`, `schema/`, `lexicon/` or `fillers/`
  knows it exists.
- No core module holds a network primitive. The surfaces may *link* to the site (a link is
  the person's choice to leave) but they cannot call it.

`test/boundary.test.mjs` checks all three on the module graph, so a fork that wants only the
core deletes a folder and four call sites rather than untangling a refactor. It is also the
property that makes deterministic filling free, instant and uncapped: no token, no session and
no network on the fill path means no amount of tiering can ever reach it.

## The three rules that shape this code

1. A wrong value is unrecoverable; a miss costs a keystroke. Every heuristic is biased
   toward refusing to answer. Three mechanisms do it: per-key disqualifiers (`not`), a minimum
   score, and a minimum margin over the runner-up (`MARGIN`, which is what catches genuine
   ambiguity like French `nom`).
2. Fill, never submit. `dom.js` has no code path that clicks a submit control, and
   `isDenied` structurally refuses password and payment fields, including every field in a
   form that *contains* a password, because a login box on a career page has an ordinary email
   field next to it.
3. A hint may suggest; only evidence may forbid. `score()` builds two texts: `all`
   (everything scraped, used to match) and `guard` (only sources describing *this* control,
   used to disqualify). Reading disqualifiers against vague surrounding text rejects almost
   everything: in a French contact fieldset the word "Prénom" three rows up vetoes
   `family_name` on the field labelled "Nom".

## Radios yes, checkboxes never

A group of radios sharing a `name` is one question with a closed answer list (the same shape as
a `<select>`) so `radioGroups()` resolves the *group* (from its legend or its own text, never
from the option labels, which are answers) and `setRadio` selects an option only when one
actually matches. No match means no fill.

Checkboxes are never touched, and that is a rule rather than a missing feature. A lone
checkbox on an application form is almost always consent: terms, data processing, a mailing
list. Ticking consent for somebody is wrong however confident the matcher is, and under the
GDPR consent has to be an affirmative act by the person.

Two details that were bugs first: the stored answer and the option label can each be the longer
of the two ("Oui, ressortissant UE" against "Oui", and "Oui" against "Oui, j'ai un titre de
séjour"), so matching tries both directions, but only on word boundaries, because a bare
substring test lets the option "Non" win inside "oui, non applicable". And a group's *parent*
text is only read when the container says nothing itself and the parent holds no other
controls; reading it unconditionally swept in a neighbouring "recevoir des offres par e-mail"
checkbox and made an authorisation group look like an email field.

## The engine: static lexicon, then the AI scout

Two paths and no third:

```
form scanned
  ├─ the known fields      → lexicon + resolver   FREE, <50ms, 0 wrong fills
  │   (~26 flat ones, plus every field of every CV section, block by block)
  └─ everything else      → AI scout             metered
```

The deterministic half keeps what justifies it: no network call, instant, uncapped, and a
wrong-fill floor `traps.html` can enforce in CI. The scout takes what it cannot name: unnamed
prose, open questions, the cover letter, and any page where deterministic coverage is poor.

## Fillers: evidence and guarded writers, never decisions

This used to say per-ATS adapters were deliberately absent, and the argument behind that still
holds: a hand-written adapter that *decides* fields is a second engine, maintained by whoever
wrote it, with its own idea of when to guess. What changed is that the extension is open to
contributions from anywhere, and some pages cannot be read or written without site knowledge:
Workday's field ids, a design system's dropdown that is not a `<select>`. So fillers exist, on
one condition: they supply evidence and operate widgets, and the core still decides.

A filler (`src/fillers/site/*.js` for one job board, `src/fillers/widget/*.js` for one kind of
control anywhere) may implement any of these, all optional:

```
match     hosts / probe(doc)  which pages it applies to (site) · widget(el) which controls it operates
controls  (root)              custom controls the native scan cannot see
describe  (el)                label evidence, weighed at 0.85, above a name, below a visible label
hint      (el)                {section, index}, checked against ids and structure; disagreement
                              makes the block suggest-only, a different section contests it
options   (el)                a custom dropdown's answers, or `true`: a closed list like a <select>
answered  (el)                has the user already answered it
write     (el, value, api)    operate the widget through `api`; return {ok, undo}
```

Why this keeps the wrong-fill floor. Nothing a filler returns bypasses the resolver: its
description is one more source scored with the same weights, `not` lists, margin and shape
rules; its hint is one more vote on the block; its options make a control a closed list, which
only select-capable fields may answer. The value it writes was chosen by the core, and matched
against the options by the core's own rule (`api.pick`).

Why it cannot submit, tick or navigate. A filler acts only through `guard.js`, bound to
the one control it was asked to write. The guard refuses submit and reset buttons, a `<button>`
with no type inside a form (a submit button by default), links, checkboxes, radios, file and
password inputs, anything outside the control and the popup it declares (`aria-controls`,
`aria-owns`), and more than six clicks per write. Refusals are misses, never errors. And
`tools/bundle.mjs` refuses, at build time and with the line number, filler code that could go
around it: `.click(`, `submit`, keyboard events, `fetch`, `chrome.`, `eval`, `innerHTML`,
`.checked =`. A rule that lives only in review is one that eventually gets merged past.

Why it cannot break a fill. Every hook runs inside a try/catch; a filler that throws
contributes nothing and the fill carries on. Its errors go to the developer console.

What proves a filler. Its own fixture directory, `test/fixtures/fillers/<id>/`, with at least
one trap; the build refuses a filler without one, and `npm run measure` reports it on its own
line and fails on a single wrong fill. The two shipped fillers are the examples:
`widget/aria-combobox.js` operates any WAI-ARIA combobox (React-Select, MUI, most design
systems), and `site/workday.js` only reads Workday's `data-automation-id`s.

Remote code is not an option and never will be: Manifest V3 and the Chrome Web Store forbid it,
so a filler ships in a release like everything else.

## Repeated sections: section → block → field

A form that asks for a career asks for it in blocks: one per job, one per degree, one row per
language. A label there ("Entreprise", "Date de début") says nothing about *which* job; the
block does. So a control in a repeated section resolves in three steps, and the first two
happen for the page as a whole in `dom.assignBlocks`:

```
section   a heading that names one           "Expériences professionnelles" → work
block     which entry, by position or id     the 2nd block → index 1
field     the lexicon, as everywhere else    "Entreprise" → work.company
                                             → entries.work[1].company
```

Scoped keys cannot fire outside a block, and inside a block nothing else can. A key named
`<section>.<field>` is only scored for a control whose block is in that section; everything
else, personal keys, the `type=email` fallback, `autocomplete` tokens, is off inside a block.
That is the whole safety argument. "Entreprise" can sit in the lexicon without ever matching a
stray field elsewhere on the page, and a "Ville" inside a job is that job's city. Before
blocks existed it resolved to the user's *home* city, which is a wrong fill nobody notices
before pressing Submit.

A section is named by an exact heading, never a substring. `sectionOf` strips decoration
("Vos", "(facultatif)", a number) and compares what is left against the section phrases. A
section decides which keys a whole block may take, so a false one costs far more than a false
field match: the page title "Chef de projet – Expérience client" must not turn the contact
form under it into a work history. The climb from a control up to its section also stops at
any unnumbered heading that names something else ("Informations personnelles"), so a control
belongs to its nearest group and not to whatever the page says further up.

The index comes from two independent sources, and disagreement only suggests. The form's
own ids (`experiences[1][company]`, Workday's `workExperience-2--jobTitle`, numbered from 1 or
from 0, decided per section from the whole page) and the structure (sibling containers under
the section with the same labels, in order). Siblings with *different* labels are rows of one
block ("Date de début" beside "Date de fin") not two entries. When the sources give different
indexes, or sibling blocks are not the same shape, the block is `weak` and every field in it is
offered rather than filled. When they name different *sections*, the block takes no key at
all. A control that sits beside the blocks rather than inside one ("Nombre d'années
d'expérience" above the list of jobs) is a flat question and goes to the ordinary keys.

The extension never clicks "Ajouter une expérience". Adding structure to somebody's form
is theirs to do. The panel says how many entries have no block, per section the page asks
for, never for one it does not, and a second click after they add one fills it: a filled block
reads as answered, and block *k* still maps to entry *k*. `toEntries` drops blank rows before
indexing for the same reason, so the third block takes the third real entry and not a row the
editor left empty.

Dates never gain precision. The rule is the export's (see JSON Résumé below): a bare
"2016" fills a year and leaves a month dropdown alone. `formatValue` fits the value to the
control, month/year dropdowns matched by option, `type=month` as `YYYY-MM`, a placeholder's
format (`MM/AAAA`) followed, and a `type=date` input, which needs a day nobody wrote down, is
only ever *offered*. A role still in progress leaves the end date empty and the "poste actuel"
checkbox unticked, because checkboxes are never touched; the panel tells the user to tick it.

A description longer than the field's `maxlength` is offered, never truncated: a cut sentence
submitted in somebody's name is worse than an empty field.

## The CV file: one upload, one key

Most application forms ask for the CV as a file before they ask for anything else. Each
library entry can hold one PDF the user attached (`shared/files.js`, IndexedDB rather than
`chrome.storage.local`, which stores JSON and would carry the file as base64 inside the bag
every read parses). An entry without one gets a PDF made from the document itself, so a
fresh install attaches a real CV on its first fill without the user producing a file.

That PDF is rendered on demand by the worker (`cvFileOf`) and never stored: derived on read,
like the active CV, so it always matches the document as saved, and none of the three paths
that write a CV (the editor, an import, the site's hand-off) has to remember to refresh it. It
is only made from a CV with a name and something besides it (`cvIsPrintable`); a name alone is
not sent to an employer.

`shared/pdf.js` writes the file by hand. A PDF library with its fonts would be most of the
package in an extension that ships no third-party code, and a CV needs little: two weights of
one font, rules under headings, wrapping and pages. It uses the standard Helvetica pair, which
every reader carries, so nothing is embedded, and their WinAnsi encoding covers French and
Spanish; a character it cannot encode loses its accent or becomes "?", never breaks the file.
One column of real text, which is also what applicant tracking systems read best. The output
is deterministic and 7-bit, so character offsets are byte offsets and `test/pdf.test.mjs` can
check every cross-reference entry against the object it names. The section titles come from
the locale (`pdf_*`) and fall back to English.

A file input is scanned apart from the text controls (`dom.fileInputs`) and never joins the
block structure. It takes exactly one key, `cv_file`, whose registry shape is `file`, and
`shapeAllows` makes the two exclusive: no text lands in a file picker and no file in a text
box. The same three mechanisms as everywhere else keep it from the wrong upload. The `not`
lists name every other document a form asks for (letter, diploma, photo, "autre document"),
so a box labelled "CV et lettre de motivation" is a miss rather than a guess. An `accept` that
rules out a PDF rules out the input. And the concealment rule still holds, moved from the input
to what stands in for it: upload inputs are almost always hidden behind a label or a drop zone,
so what must be visible is that surface (`fileSurface`), and an input with no visible surface
gets nothing.

The bytes stay in the worker until a page asks. The profile a content script receives carries
the file's name and size; the content script asks for the file (`cv-file`) only when the
resolver has named a CV upload on the page, so a page without one never receives the document.
It crosses as base64, because extension messages are JSON, and is written with a
`DataTransfer`, the only way to build the `FileList` an input accepts, followed by the picker's
own `input` and `change` events.

## Choosing a CV

Several CVs are only useful if choosing one is where the choice is made. The popup sets the
CV the extension uses everywhere (`cv:activate`, the same as the CV page). The panel says which
CV filled the page and offers the others; picking one undoes this fill and fills again from
that CV, for this page only. It does not change the active CV, which is why the worker reads a
non-active entry through `store.readAs(id)` without persisting anything, and why the offer
analysis on that page is sent with the same id: the score is about the document the form was
filled from. The content script learns ids and names of the CVs (`cv:choices`), never the
documents, and the picker acts only on a trusted change event, like every other control in the
panel.

## A form that grows

A wizard renders its next step after "Suivant", an ATS renders a section late, and a user adds
a block. A fill used to be one pass at click time. Now, for two minutes after a fill, a
`MutationObserver` watches for added nodes that hold a form control and runs the same
`runFill` again, debounced, with a `skip` set of every control the page has already been
through. Only new controls are written or offered. That set is the point: a field the user
emptied after the fill is a decision, and a re-fill that filled it again would overrule them
silently. The watch ends on "tout annuler", on the next click (which starts a new one), and on
its timeout. The panel is updated in place rather than rebuilt, so an offer analysis already on
screen survives a re-fill.

Only additions wake it. A control revealed by toggling `display` is not an added node, and a
toolbar click still covers that case.

## The application tracker

Every page the extension fills is an application the user may want to follow, so the fill
records it (`shared/applications.js`), and the dashboard's applications view
(`dashboard.html#candidatures`) shows the list with a status, a note
and a CSV export. It is core: local storage, no account, no network, like the fill that feeds it.

An entry is one job page, keyed on its address with tracking parameters and the fragment
removed (`applicationKey`), so a second fill or a wizard's second step updates it rather than
adding one. The worker computes that key from the tab the message came from, never from the
message, so a page can record or update only its own entry. A title read from the advert
replaces one taken from the page title and never the reverse, and a new fill never moves a
status back: filling the form again after "entretien" does not make it "remplie".

The extension cannot know whether the form was sent, because it never sends it. The panel asks,
with one button, and that button can only move an entry forward from "remplie".

## The skills line: the free half of reading an advert

On a page with an advert, the panel says which of the CV's skills, languages and certificates
the advert names ("3 sur 7"), and can mark them in the page. It is a plain whole-word match on
this machine (`content/keywords.js`), which is exactly what it claims to be; what the advert asks
for that the CV lacks, and how much that matters, is the paid analysis just below it. Short terms
keep their case, so "Go" or "SQL" do not match ordinary words, and "Java" is not in "JavaScript".

Marking uses the CSS Custom Highlight API: ranges over the page's own text nodes, drawn by the
browser. No `<mark>` is inserted and no node moves, so a React page keeps its state, and turning
it off leaves the markup exactly as it was, which `e2e.mjs` checks by comparing it.

## The cover letter: the AI tier's first answer

A letter box (`cover_letter`, a textarea) is left empty by the fill. When the page also has an
advert, the panel offers to write the letter. That is the add-on: `letter` in
`epimoni/worker.js` sends the CV document and the advert's text to
`/ml/analyse/motivation/generate-doc` with the form's limit, from the box's `maxlength` or from
what its label says ("1500 caractères maximum"). The backend holds the letter to that limit with
one measured repair pass.

The letter is shown, counted, and put in the box only on a click, where it joins "tout annuler"
like any fill. Prose in somebody's name is theirs to read first. A letter longer than the box
accepts is never cut to fit: the insert button is disabled and the user can copy it instead.

`meteredCall` is the one path every paid feature takes: resolve an identity only then (it may
open a session), retry once on a 401, and on a 429 forget the cached allowance. The backend
memoises the same CV, advert, template and limit without charging, and the worker caches the
answer for the session, so reopening the panel costs nothing.

## Reading the advert: the heuristic is primary, JSON-LD only enriches

You'd expect it the other way round. We measured it:

| Board | `JobPosting` JSON-LD | container heuristic |
|---|---|---|
| France Travail | none at all | `main#contents`, 1009 words |
| HelloWork | yes: 725-word description, salary, org | `main`, 538 words |

The board the product is built around publishes no structured data, so JSON-LD cannot be the
primary path. Where a board does publish a JobPosting its `description` is still the better body,
since it is the advert without the apply rail and the related-offers list. So `chooseSource`
compares the two and takes the richer, with a floor of 40 words.

`chooseSource` is pure, like `resolve`: the decision about what gets sent to a *paid* model is
testable without a browser.

Two things that were bugs first: a `baseSalary` can carry a currency and no amount (HelloWork
does), which rendered as "Rémunération : EUR": a line that costs tokens and says nothing; and
France Travail states the job title on the heading, the apply button, the print link and the
locate link, so identical short lines are deduplicated. Short ones only: two identical
*paragraphs* belong to whoever wrote the advert. Note what this deliberately is not: a list of
per-board button labels, which would be an adapter wearing a different hat.

## The CV document, and the library that holds several

The dashboard's CV view (`src/dashboard/cv.js`) is the only surface that can create a CV. Storage holds a
library, `cvs`, a list, and an `active_cv_id`, because one slot was wrong in a way that
only showed up in use: a hand-off from the site overwrote a CV somebody had typed here, with
no warning and no way back, and one document cannot answer "the short CV for agencies or the
long one for direct applications?", which is the question an application form actually asks.

Everything downstream still reads `state.cv`. `store.read()` spreads the active entry over the
bag on the way out, and `store.write()` refuses those same keys on the way in:

```
cvs: [ {id, label, cv, source, profile, builder_id, …}, … ]   persisted
active_cv_id ──┐
               └──▶ read() ──▶ state.cv, state.cv_source, state.builder_id …   derived, never stored
```

One writer, one copy. A `cv` written onto the bag would be shadowed by the library on the next
read, and the two would disagree forever: a bug that looks like storage losing writes, which
is why `write()` drops those keys rather than accepting them quietly.

Three sources feed it, and `source` records which: `account` (paired while signed in), `site`
(handed over by an anonymous visitor), `local` (typed or imported here). Editing a document
does not change where it came from, so the badge and the link back to the site survive
somebody fixing a typo. Saving matches on `builder_id` when there is one, so re-pairing the
same site document after editing it is an update rather than a second copy of the same CV.

Normalisation happens on the way in, in the service worker, which is also the only
normaliser: `store.js` imports nothing and takes a document already in shape:

```
site hand-off  ─┐                        ┌─ toProfile()      fills the form
JSON import    ─┼─▶ normalizeCvDoc ─▶ cv ─┼─ offer analysis  scores the advert
the CV page    ─┘                        └─ options.js       re-renders it
```

A surface that sent its own flat profile would be a second chance for the two to drift apart.
Where an entry carries no stored profile at all (which is what a bag migrated from the old
one-slot shape can look like) the worker derives one from the document rather than repairing
storage, because an install holding a complete CV and filling nothing is the worst shape of
failure: everything on screen says it should work.

`cvIsAnalysable` is a floor: a name and nothing else is enough to fill a form and not enough
for a comparison to mean anything, and charging a quota to score a name is what it prevents.

## JSON Résumé: an open format, not a resemblance

The document above is JSON Résumé-*shaped* and was not conformant. It wraps `label`, `summary`
and `position` in `{text}` so an AI diff can hang off them, writes a highlight as `{id, text}`
so a list can be reordered without re-keying, and keeps dates as the free text a person typed
("en cours", "Jan 2021"). Every one of those is deliberate, and every one would make an
exported file useless to any other tool: `[object Object]` where the job title should be.

`toJsonResume` and `fromJsonResume` in `shared/cvdoc.js` are the boundary. Inside, the shape
stays ours; exported, it is a `resume.json` any renderer or parser in the ecosystem accepts,
and any `resume.json` imports without a translation layer. `jsonResumeProblems` checks what a
schema validator would, for the parts our own shapes break, so the test suite can assert
conformance without taking on a dependency.

Two details that decide whether the translation is honest:

- An ongoing role exports with no `endDate`. JSON Résumé cannot write "en cours"; it
  writes nothing, and a missing end already means "until now" to `yearsOfExperience`. The two
  conventions agreed before either was written down, so this is a translation rather than a
  loss.
- A bare year stays a bare year. The parser defaults an unstated month to January for
  arithmetic, and exporting that would turn "2015" into "2015-01": inventing a precision the
  person never gave. `toIso8601` emits `YYYY-MM` only when the source actually named a month.

Reading ISO dates back is part of the same change: before, `2021-06` matched none of the
free-text rules and fell through to January, a silent six-month error on every imported
résumé. Round-tripping a CV now leaves `toProfile` and `yearsOfExperience` identical, which is
what the tests assert rather than comparing documents field by field.

## A disposable session token is never stored

The extension works for somebody who has never signed in, and that is implemented as a rule
about *tokens*, not about people. A token belonging to an anonymous browser session is replaced
whenever site storage is cleared and is attached to nobody who could later revoke it, so keeping
one for weeks would pair the extension to a session rather than to an account. Refusing the
*token* is the rule; refusing the *CV* would be collateral.

So there are three ways a CV arrives, and `state.cv_source` records which:

| source | how | token |
|---|---|---|
| `account` | paired from the site, signed in | kept |
| `site` | handed over by an anonymous visitor | not sent |
| `local` | typed or imported in the extension's own CV page | none exists |

`test/pair.test.mjs` covers the `externally_connectable` listener, which the e2e suite cannot
reach: that origin check accepts only the real https origin, and faking it in a real browser
would need a certificate for a domain we do not own. The assertions that matter most are the
negative ones: nothing is in storage until the user accepts, and an anonymous hand-off never
leaves a token behind.

## The site asks; the user decides

`externally_connectable` lets any script on www.epimoni30.com message the extension: the
site's own code, but also every tag it loads and every page on that origin. A pairing that took
effect on arrival would let any of them replace the paired account with one they control, after
which every offer analysis sends the user's CV to an account somebody else can read, or slip a
CV of their own into the library to be typed into the next application.

So an `epimoni:pair` message is a *request*:

1. Cleaned. Each field is kept only with the right type and under a size cap
   (`sanitizePairing` in `epimoni/worker.js`); the flat profile keeps string values only.
2. Verified. An account token is sent to `/users/me`. The request is refused unless the
   server recognises it *and* names the same `user_id` the message claims. Whether it is an
   anonymous session is read from the server's record, not from the message's `user_type`.
   Fails closed: offline means no pairing.
3. Parked. It waits in `storage.session`, one at a time, for five minutes. A second request
   while one is waiting is refused (`busy`), so what the user is looking at cannot change under
   the cursor.
4. Decided on an extension page. The worker opens `src/epimoni/pair.html`, which shows the
   account's address as the *server* reported it and the CV's name, and applies the request
   only on a real click on Accept. A refusal also refuses every new request for a minute, so a
   page cannot keep opening tabs.

The same rules apply whether the request arrives over `externally_connectable` or through the
bridge: both go through `fromSite`. Details are in `docs/pairing.md`, "Two transports".

The site learns the outcome by polling `epimoni:pair-status` with the id it was given:
`pending`, `accepted`, `refused` or `expired`, and nothing else. It never gets the token back.

The same rule runs inside the extension. The worker answers a content script (which lives in a
job board's renderer, next to code we do not control) only for what filling needs: the
profile, the offer analysis, the allowance, usage reports, opening the CV page. Reading the
whole library, editing it, erasing it and unpairing are for extension pages only.

## Gotchas worth knowing before editing

- A CvDoc field is polymorphic: a string, `{text}`, or a legacy `{diff:{tokens}}`,
  including `{diff:{reverted:true}}`, which must read as the *original*, not the proposal. Use
  `fieldCurrent()` in `shared/cvdoc.js`; reading `.text` directly fills forms with
  `[object Object]`.
- `basics.location` is `{city}` in newer documents and a bare field in older ones. Both
  shapes are live.
- React ignores `el.value = x`. Go through the prototype's original setter, then dispatch a
  *bubbling* `input` event. The fixtures install a React-style instance setter precisely so a
  regression here fails the measurement instead of passing quietly.
- `<select>` is matched against its options. Writing an unmatched value leaves the control on
  its old selection: a silently wrong answer reported as a success.
- Language packs are merged, never chosen by the page's language, so cross-language collisions are real and
  must be handled in the `not` lists: `nombre` is a name in Spanish and a count in French;
  `resume` is a CV in English and a summary in French (which is why the summary key does not
  list the bare word at all).
- `thirdParty` (in each language pack) disqualifies every personal key at once when the
  label mentions an emergency contact, a recruiter, a referrer or a family member. Add to that
  list, not to twenty individual `not` lists. Which keys are personal is the registry's
  `personal` flag, true unless said otherwise: a new field is protected by default.
- A pack is JavaScript, not JSON, so a `not` entry can say why it is there. The build still
  treats it as data: unknown keys, unknown sections and accented or capitalised phrases fail.
- An unresolved *prose* field becomes `action: 'ai-candidate'`. A recognised key refused on shape
  becomes `skip: shape-refused` instead, because the AI tier should never be handed a question
  the lexicon already understood.

## Firefox asks before data leaves

Firefox records, apart from install, whether an add-on may transmit data, in Mozilla's
categories (`data_collection_permissions`, declared in `platform/firefox.mjs`). The free core
sends nothing and declares nothing it needs. The add-on's two kinds of sending are declared
optional, and `epimoni/consent.js` holds each to a grant: the CV and the advert
(`personallyIdentifyingInfo`, `websiteContent`) before an analysis or a letter, and the
counts-only usage events (`technicalAndInteraction`, `browsingActivity`) before `track`
sends anything, which on Firefox is never unless the user allows it.

The consent is checked after the account, not instead of it: `aiRefusal` refuses an unpaired
install first (`not-paired`, no network), then a paired one without the grant (`consent`). A
paired account is not a grant, because the grant is the browser's to record. It is asked for
inside a click: on the pairing page's Accept, and on `src/epimoni/allow.html`, which the popup
and the panel open. The gate is the manifest, not a browser sniff: a build that declares no
optional collection, which is Chrome's, has nothing to ask and every check answers yes.

## MV3 facts that change how you write the code

- The service worker is killed after ~30 s idle and restarted on the next event. Every
  module-level variable resets, so a counter in a `let` caps nothing: `telemetry.js` keeps its
  budgets in `chrome.storage.session` for exactly this reason. Anything that must survive
  between events belongs in storage, not in scope.
- Undoing a fill has to go through the native setter too. `clearValue` exists because
  `el.selectedIndex = 0` empties the DOM while leaving the framework holding the old value, and
  the form submits what the framework holds, so a "cleared" field still sends data.
- Store limits are validated at build time: `name` ≤ 75 characters, `description` ≤ 132, all
  locales carrying the same keys, and every declared icon present on disk. The store enforces
  these *after* review starts, which is a slow way to learn about them.
- `isDenied` takes a precomputed set of password-bearing forms. Called per control without
  it, the password check walks the whole form subtree N times, which is quadratic on the long
  multi-section forms ATS pages are made of.

## Chrome behaviours that cost real debugging time

- Site access defaults to "on click" for hosts outside `host_permissions`. A declared content
  script then does not run on page load, and `chrome.tabs.query()` returns `url: null` for
  those tabs. From the outside this looks exactly like a broken `content_scripts` registration.
  The `null` URLs are the tell. Either click the toolbar icon (which is the product's intended
  path: `activeTab` at the moment of use) or grant the site in chrome://extensions. Do not go
  looking for a manifest bug.
- `match_origin_as_fallback` requires every pattern in its entry to have a path of exactly
  `/*`. One narrower pattern makes Chrome refuse the whole extension. That is why
  `content_scripts` is split in two entries; `build.mjs` validates the rule so it fails at build
  time instead of at load.
- A service worker whose import does not resolve fails invisibly. chrome://extensions shows
  the extension as loaded and every message simply goes unanswered. `build.mjs` checks that each
  relative import in the built worker resolves in `dist/`.
- `chrome.runtime.sendMessage` from the service worker does not reach the worker's own
  `onMessage`: it resolves to `undefined`. Drive the worker from an extension page instead.

## Fixtures

`test/fixtures/*.html` are reconstructions, not captures: the real forms are behind logins.
Field sets follow each site's published flow. Ground truth lives in
`data-expect="<canonical key|none|ai-candidate>"` on every control, which is what makes wrong
fills measurable rather than merely visible. `traps.html` is the false-positive gauntlet and
every control in it must stay untouched. A field of a repeated section is annotated with its
entry, `data-expect="work[1].company"`; `parcours.html` (French, labelled by position) and
`indexed.html` (Workday-style ids) carry the block traps: a job's "Ville", a references
block, a field outside every block.

`test/fixtures/postings/` holds reduced advert pages for the extraction tests. `npm run probe`
fetches live postings into an ignored directory for local work; those captures are third-party
page markup and are not redistributed.

### The playground is the measurement, in a visitor's browser

`playground/` is published on GitHub Pages (`.github/workflows/pages.yml`). A visitor writes a
JSON Résumé, picks a fixture, and presses Fill; the page loads `engine.js` into the fixture's
frame and scores the result. Nothing in it is a second implementation:

- `engine.js` is `bundleContent()`, the bundle `build.mjs` ships and `measure.mjs` scores;
- the in-page runner and the verdicts are `test/scoring.js`, which `measure.mjs` imports too;
- the fixture list is `test/fixture-list.mjs`, shared the same way.

`test/playground.mjs` holds it to that: filling every fixture through the page must give the
same verdicts as the measurement's own runner, with 0 wrong. The playground is core-only, it
copies `cvdoc.js`, the packs and the registry, never `src/epimoni/` or the store, and
`test/boundary.test.mjs` refuses a change that would make it otherwise. The CV a visitor types
stays in their browser's `localStorage`.
