# Changelog

All notable changes to this extension are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version is the one in `manifest.json`, which the Chrome Web Store shows. `package.json`
carries the same number, and the release workflow refuses a tag that does not match both.

## [Unreleased]

### Added

- Italian: the extension's interface, and Italian application forms. "Nome e cognome",
  "Cognome", the CAP, the RAL desiderata and the laurea triennale or magistrale are read; a
  certified e-mail (PEC), a codice fiscale and a birthplace are left alone. A bare "Nome" is
  offered rather than filled, because a Brazilian form uses the same word for the whole name.
  Questions in Italian about the right to work in a country are checked against that country.

- LinkedIn Easy Apply: the "Code pays" list is set from the code your phone number carries
  ("France (+33)"), and the number beside it goes in without that code. A "+1" number is
  matched to your country, or left for you when that doesn't say which.

- Taleez forms: the phone, the CV and the three dropdowns (level of study, years of
  experience, expected salary) are filled. The dropdowns open into an overlay at the end of the
  page, and the extension may now click inside a list that its own click on the dropdown made
  appear, and nowhere else.
- "Do you speak fluent French?" is answered yes when the CV holds French at the level asked,
  and "How well are your English language skills?" or "Niveau d'anglais" with the CV's level
  for that language. A language the CV doesn't list is left for you; the extension never
  answers no.
- Answers worded differently from the CV: "C1" picks "Courant", eight years pick "5 à 10 ans",
  a master picks "Bac +5", and "42 000 €" picks the "40 000 à 45 000 €" bracket. Each happens
  only when exactly one option fits; a figure on the edge of two brackets is left for you.
- A step of a form that was already in the page and is only shown later (a wizard switching
  steps) is filled as it appears.
- SmartRecruiters forms: the CV is attached and the city filled. Their fields are web
  components, and the extension now reads an upload's name and a list's options through the
  shadow roots they sit in.
- `npm run probe:console`: a read-only probe to paste into DevTools on a page you're signed in
  to, for boards an automated browser can't reach. It reads and resolves every field and
  writes nothing.
- Workable's French "Résumé" box gets the CV summary. In French the word means a profile
  summary; the English "Resume" box, which asks for the whole CV as text, is still left alone.

### Changed

- A page that says it is in Portuguese fills a bare "Nome" or "Seu nome" with your full name,
  and one in Italian fills "Nome" with your first name. Without a page language the field is
  offered for you to confirm, since the two languages read the word differently.
- When a board already has one of your saved CVs ticked (LinkedIn's CV step), your CV is
  offered instead of uploaded. Uploading would replace that choice and add a file to your
  account on the board.

### Fixed

- The extension's store description says the analysis and the letter need an Epimoni account;
  it read as if they worked without one. The English pages say "CV" throughout, and the
  Spanish consent messages use "usted" like the rest.
- French diploma fields that name a CAP ("Spécialité du CAP", "Nom du CAP") are no longer
  taken for a postcode or a surname.
- "First name (as on file)" and other English first-name labels with "file" or "social" in
  them are filled again, and a project's name ("Nome do projeto") is no longer taken for yours.
- The "Remplir avec Epimoni" button now shows on LinkedIn when you reach a job from the feed,
  a search or a message. LinkedIn opens a job without loading a new page, so a script that ran
  only on its Jobs pages never arrived. Only the button runs on the rest of LinkedIn, and it
  does nothing outside the Jobs pages; the filler comes with your click, which is why the
  extension now asks for access to www.linkedin.com (no new install warning: it already ran
  there).
- When the button cannot fill the page it is on, it says so and points to the toolbar icon,
  instead of disappearing with nothing filled.
- Hidden parts of the popup, the applications board and the pairing page stay hidden: an
  unlabelled checkbox showed in the popup over a new tab, the empty board showed above its
  own "no applications yet" message, and the pairing page kept its buttons after a request
  had expired.
- Without a connected account, the "Import my existing CV" card says up front that sorting
  the text into sections needs one. It used to say so only after you had picked a PDF.
- Counts are written with real plurals: "1 expérience, 3 compétences" rather than
  "expérience(s)", in the CV page and in the panel's open questions.
- Indeed Apply (`smartapply.indeed.com`), where Indeed's own application forms live, is now a
  supported board: the button shows there and automatic filling works, like on Indeed itself.
- LinkedIn Easy Apply's "add an experience" form: the start month and year are filled from
  the job, like its title and company. A month and year under their own "From" caption were
  read as a separate group and left out of the job.
- The "Remplir avec Epimoni" button no longer appears on an article whose comment or rating
  form asks a name and an e-mail just because the article says "application", nor on a
  checkout whose "Apply" is for a coupon. It now judges each form by its own headings, labels
  and buttons. It also appears, as it should, on forms built from web components
  (SmartRecruiters).
- A row whose label the page doesn't link to its field is read by that label. On Taleez the
  phone and the CV were read as their widget's icon text and missed.
- A phone field showing its own "+33" gets the national number, and one pre-filled with only
  "+33" (Recruitee) is no longer taken as already answered.
- The e-mail on HelloWork, marked up as a list of domain suggestions, is typed in. A
  suggestion list with no match no longer leaves half-typed text behind.
- A location field that asks a server for suggestions is given time to answer, instead of
  being picked from the previous list.
- A bare "Location", "Where are you based?" and plural "salary expectations" are recognised.
  "Which school are you enrolled in?" and a work-right question about a country the extension
  can't name (Hong Kong, "the country where this job is located") are left alone.
- Ashby's "Autofill from resume" box is no longer offered the CV: a file there is read back
  over what was just filled.
- Free text such as "Immédiate" is offered for a date picker rather than typed into it.
- The CV page no longer promises an analysis without an account, and counts each CV once.

### Removed
- The extension's own anonymous session, which nothing could reach since the analysis needs an
  account.

### Security
- A form inside a frame is filled only once the browser says a person can see it. A page could
  embed a form from another origin and fade it out, shrink it to a pixel or cover it, and a fill
  clicked on that page wrote the CV into it, where the frame's own script could read it. A frame
  below the fold is not refused: it fills when you scroll to it. In Firefox, which cannot tell,
  a frame inside a page of another origin is left alone.
- The tracker's CSV export keeps a page title that starts with `=`, `+`, `-` or `@` as text.
  A job page titled like a formula would otherwise run as one when the file is opened in a
  spreadsheet.
- Usage reports from a page are cut down by the extension itself to counts and field names,
  with the site taken from the browser rather than from the page. The page side never sent a
  value, but nothing checked that it didn't.

## [0.3.0] - 2026-10-16

### Added

- Polish: the interface, and the form labels the extension recognises ("Imię i nazwisko",
  "Oczekiwania finansowe", "Okres wypowiedzenia", Polish month names). It leaves the parents'
  names, a middle name and a maiden name empty. Brazilian Portuguese came earlier and was not
  listed here.

### Security

- Clickjacking protection for the in-page button and panel. A click counts only if the person
  could see what they clicked: the UI must have been on screen for half a second, and a page
  that fades, filters, clips or covers it gets its click refused, with a note pointing at the
  toolbar icon. This is the DOM-based extension clickjacking attack shown at DEF CON 33.
- A Content Security Policy for the extension pages and the service worker: they may connect
  to the API and nowhere else, run only their own scripts, can't be framed and can't post
  forms.
- The PDF reader, the JSON Résumé import and the label normaliser are fuzzed with property
  tests (fast-check): mutated real PDFs, arbitrary bytes, arbitrary JSON. Every pull request
  runs them; a weekly job runs fifty times as many cases.
- Releases carry a `SHA256SUMS` file and a signed build provenance attestation, and CI checks
  that two builds of the same source are byte-identical.

### Fixed

- Your work authorisation answer only goes into a question about a country it covers. "Oui,
  ressortissant UE" answers "…in France?" or "…in Germany?", but no longer "…in the United
  States?", nor a question about "the country listed". An answer that names no country is
  read as being about the country you live in.
- A question asking whether you need a visa or sponsorship is no longer read as the work
  authorisation question. The stored answer ("Oui, ressortissant UE") picked "Oui" there,
  which told the employer you need a visa. Found on live Greenhouse forms; fixed in all five
  languages.
- A question about years in one domain ("How many years of outbound sales experience?",
  "Années d'expérience en gestion de projet") is no longer answered with your whole career's
  total. Found on a live Teamtailor form; fixed in all five languages.
- A dropdown wrapped in its own `<label>` (Lever does this) no longer reads its options as part
  of the question. "Which office would you prefer?" with "Mexico City" among the answers was
  read as a city field and got your home town.
- Measured on live Lever, Ashby and Greenhouse application pages: "Current location" is now
  filled with your city, a Lever question whose text sits above its answers is read (it used
  to be seen only by its field name), and French inclusive writing such as "autorisé(e)" or
  "candidat·e" is read as the plain word.
- A long panel no longer starts above the top of the window with its close button out of
  reach.

### Changed

- The in-page panel is a named region for screen readers, announces what it filled, and closes
  with Escape.
- The CV and cover-letter PDFs keep Polish letters (ą, ć, ę, ł, ń, ś, ź, ż) instead of writing
  them without their accent, and a text extractor reads them back as written. A name outside
  ASCII now shows correctly in the PDF's title and author.
- The free allowance for the AI features reads one an hour again, matching the backend since
  15 October (it was two from 1 October).

## [0.2.0] - 2026-10-02

Prepared but never tagged: these changes were first published in 0.3.0.

### Added

- The applications are a board, one column per status. Drag a card to move it (the status menu
  on each card does the same from a keyboard or a touch screen), and add an application the
  extension did not fill, with or without a link.
- Automatic filling, one site at a time. Ticked in the menu on a site, an application form
  there is filled as it appears, including one a site shows only after "Apply". Off by default;
  outside the supported job boards your browser asks for that one site, and turning it off gives
  the access back. The sites are listed on the dashboard.
- The cover letter is offered on any page with a job ad, not only on forms with a letter box,
  and saves as a PDF laid out as a letter.
- "Tailor my CV to this job" (AI, connected account): the proposed changes are listed to review,
  and a change that adds something your CV did not say is left unticked. The ones you keep make
  a new CV beside the original, which fills the form with its own PDF.
- "Import my existing CV": your PDF is read on your computer (including PDFs "protected" with
  no password, as some CV builders make them), you check the text, and Epimoni's AI sorts it
  into sections without rewriting it (connected account). The PDF stays the file sent to forms.

- A "Fill with Epimoni" button on pages with an application form: one click fills. On by
  default on the supported job boards; on every other site after you allow it once, from the
  menu or the Sites page. After any fill, the panel offers "Always fill here" in one click.

### Changed

- The in-page panel scrolls when it is taller than the window.
- With no CV yet, the menu leads with "Add my CV", and says why the per-site switch waits.

## [0.1.0] - 2026-09-28

First public version.

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
- A CV editor inside the extension, with a library of several CVs and one active. Filling
  needs no Epimoni account; the offer analysis and the cover letter need a paired account.
- JSON Résumé import and export, including projects, volunteering, awards, publications,
  interests and references.
- Custom dropdowns (WAI-ARIA comboboxes: React-Select, MUI and most design systems) filled and
  undone like native ones.
- Workday: fields named from Workday's own ids, including ones with no visible label.
- Pairing with an Epimoni account from epimoni30.com, which hands over the CV already there.
- Offer analysis: the CV compared against the job advert on screen, on request only, never on
  page load.
- Interface in French, English and Spanish.
- Your CV attached to upload fields: the PDF you added to a CV in the library, or one made
  from the CV itself when you have not added one.
- Forms that grow as you go (LinkedIn Easy Apply steps, "Add another" blocks) are filled again
  without touching what was already filled.
- A CV picker in the menu, and a choice of CV for the current page from the review panel.
- A dashboard page with the CV library and a list of the applications you filled, kept on
  your computer only.
- The skills from your CV highlighted in the job advert, without changing the page.
- A cover letter written for the advert on screen, shown first and inserted only when you click.
- A Firefox build (`node build.mjs --target=firefox`), attached to each GitHub release.
- epimoni30.com reaches the extension through a content script on its own pages, which needs no
  extension id and works in Firefox.
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

[Unreleased]: https://github.com/epimoni30/epimoni-autofill/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/epimoni30/epimoni-autofill/compare/v0.1.0...v0.3.0
[0.1.0]: https://github.com/epimoni30/epimoni-autofill/releases/tag/v0.1.0
