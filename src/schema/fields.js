// SPDX-License-Identifier: Apache-2.0
// The canonical fields: the one definition of every question this extension can answer.
//
// Everything else is derived from this file. The resolver reads a field's *shape* from here
// (may it go into a dropdown? into a one-line input?), `toEntries` reads *where it lives* in
// the CV, the build checks every language pack and every locale against it, and a
// contributor adding a field adds it here first: a phrase in a language pack for a key that
// is not listed here is a build error, not a silent no-op.
//
// The backbone is the open CV structure, JSON Résumé (https://jsonresume.org/schema), which
// is also our stored document's shape. A field of a repeated section names its JSON Résumé
// property in `from`; a flat field says where its value comes from in `source`.
//
// Shapes:
//   short  a one-line answer; refused on a textarea (a surname in a 2000-character box is a
//          misread of the form)
//   long   prose; refused on a one-line input unless its maxlength says it is a letter field
//   date   a date; may be a text input, a month input or split month/year dropdowns
//   any    no constraint from the control's size
// `select: true` lets the value go into a closed option list (a <select>, a radio group, a
// filler's option list). Anything else resolved onto one is a miss by design: free text and
// a closed list are different questions, and guessing an option is how a wrong answer is
// submitted. Every date is select-capable.
//
// `personal` (default true) marks a field that describes the user, and so must never answer
// a question about someone else: an emergency contact, a referee. See `thirdParty` in the
// language packs. It is a list of exceptions rather than of members so that a new field is
// protected by default.

/** Every CV section a form may ask for as repeated blocks, in JSON Résumé's own names. */
export const SECTIONS = [
  'work',
  'volunteer',
  'education',
  'awards',
  'certificates',
  'publications',
  'skills',
  'languages',
  'interests',
  'references',
  'projects',
];

// ── Flat fields: asked once per form ────────────────────────────────────────────────────
//
// `source`:
//   cv      computed from the document by `toProfile` in shared/cvdoc.js
//   extras  typed by the user in the extension; the CV format has no place for it
//   none    recognised so it is left alone, never filled (the cover letter is the AI tier's)
const FLAT = [
  { key: 'given_name', shape: 'short', source: 'cv' },
  { key: 'family_name', shape: 'short', source: 'cv' },
  { key: 'full_name', shape: 'short', source: 'cv' },
  { key: 'email', shape: 'short', source: 'cv' },
  { key: 'email_confirm', shape: 'short', source: 'cv' },
  { key: 'phone', shape: 'short', source: 'cv' },
  { key: 'street', shape: 'any', source: 'extras' },
  { key: 'postal_code', shape: 'short', source: 'extras' },
  { key: 'city', shape: 'any', select: true, source: 'cv' },
  { key: 'country', shape: 'any', select: true, personal: false, source: 'extras' },
  { key: 'linkedin_url', shape: 'any', source: 'cv' },
  { key: 'github_url', shape: 'any', source: 'cv' },
  { key: 'portfolio_url', shape: 'any', source: 'cv' },
  { key: 'current_title', shape: 'any', source: 'cv' },
  { key: 'current_employer', shape: 'any', source: 'cv' },
  // A profile summary may be asked in a one-line input with no stated limit; a cover letter
  // may not.
  { key: 'summary', shape: 'long', oneLine: true, source: 'cv' },
  { key: 'cover_letter', shape: 'long', source: 'none' },
  { key: 'years_experience', shape: 'any', select: true, source: 'cv' },
  { key: 'salary_expectation', shape: 'any', source: 'extras' },
  { key: 'notice_period', shape: 'any', select: true, source: 'extras' },
  { key: 'availability_date', shape: 'any', select: true, source: 'extras' },
  { key: 'work_authorization', shape: 'any', select: true, personal: false, source: 'extras' },
  { key: 'education_degree', shape: 'any', select: true, source: 'cv' },
  { key: 'education_institution', shape: 'any', source: 'cv' },
  { key: 'skills', shape: 'any', source: 'cv' },
  { key: 'languages', shape: 'any', select: true, source: 'cv' },
];

// ── Fields of a repeated section: one per block, one block per CV entry ──────────────────
//
// `from` is the JSON Résumé property. `read(entry, h)` replaces it where the value is not a
// plain copy; `h` carries the readers from shared/cvdoc.js (`str`, `date`, `prose`, `words`),
// so this file stays free of imports and can be bundled into the content script as it is.
const SCOPED = {
  work: [
    { field: 'position', from: 'position' },
    { field: 'company', from: 'name' },
    { field: 'location', from: 'location' },
    { field: 'url', from: 'url' },
    { field: 'start', from: 'startDate', shape: 'date' },
    { field: 'end', from: 'endDate', shape: 'date' },
    { field: 'description', shape: 'long', read: (e, h) => h.prose(e.summary, e.highlights) },
  ],
  volunteer: [
    { field: 'position', from: 'position' },
    { field: 'organization', from: 'organization' },
    { field: 'start', from: 'startDate', shape: 'date' },
    { field: 'end', from: 'endDate', shape: 'date' },
    { field: 'description', shape: 'long', read: (e, h) => h.prose(e.summary, e.highlights) },
  ],
  education: [
    { field: 'institution', from: 'institution' },
    // `studyType` is the degree ("Master") and `area` the subject. A document with no
    // `studyType` (which is every one the builder writes) keeps the whole title in `area`,
    // so that is the degree, and the subject is left empty rather than said twice.
    { field: 'degree', select: true, read: (e, h) => h.str(e.studyType) || h.str(e.area) },
    { field: 'field', read: (e, h) => (h.str(e.studyType) ? h.str(e.area) : '') },
    { field: 'start', from: 'startDate', shape: 'date' },
    { field: 'end', from: 'endDate', shape: 'date' },
    { field: 'score', from: 'score' },
    { field: 'details', shape: 'long', read: (e, h) => h.str(e.details) || h.words(e.courses) },
  ],
  awards: [
    { field: 'title', from: 'title' },
    { field: 'awarder', from: 'awarder' },
    { field: 'date', from: 'date', shape: 'date' },
    { field: 'description', from: 'summary', shape: 'long' },
  ],
  certificates: [
    { field: 'name', from: 'name' },
    { field: 'issuer', from: 'issuer' },
    { field: 'date', from: 'date', shape: 'date' },
    { field: 'url', from: 'url' },
  ],
  publications: [
    { field: 'name', from: 'name' },
    { field: 'publisher', from: 'publisher' },
    { field: 'date', from: 'releaseDate', shape: 'date' },
    { field: 'url', from: 'url' },
    { field: 'description', from: 'summary', shape: 'long' },
  ],
  skills: [
    { field: 'name', from: 'name' },
    { field: 'level', from: 'level', select: true },
    { field: 'keywords', read: (e, h) => h.words(e.keywords) },
  ],
  languages: [
    { field: 'language', from: 'language', select: true },
    { field: 'fluency', from: 'fluency', select: true },
  ],
  interests: [
    { field: 'name', from: 'name' },
    { field: 'keywords', read: (e, h) => h.words(e.keywords) },
  ],
  // A references block is *about* a third party by definition, so its fields are not
  // personal: the third-party veto would otherwise refuse every one of them.
  references: [
    { field: 'name', from: 'name', personal: false },
    { field: 'reference', from: 'reference', shape: 'long', personal: false },
  ],
  projects: [
    { field: 'name', from: 'name' },
    { field: 'url', from: 'url' },
    { field: 'start', from: 'startDate', shape: 'date' },
    { field: 'end', from: 'endDate', shape: 'date' },
    {
      field: 'description',
      shape: 'long',
      read: (e, h) => h.prose(e.description || e.summary, e.highlights),
    },
  ],
};

const normalized = (f) => ({
  shape: 'any',
  personal: true,
  oneLine: false,
  ...f,
  // Every date may be a dropdown.
  select: Boolean(f.select) || f.shape === 'date',
});

/** Every canonical field, flat and scoped, as `{key, section?, field?, shape, select, personal, …}`. */
export const FIELDS = [
  ...FLAT.map((f) => normalized({ ...f, section: null })),
  ...Object.entries(SCOPED).flatMap(([section, fields]) =>
    fields.map((f) => normalized({ ...f, section, key: `${section}.${f.field}` })),
  ),
];

const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/** The field a canonical key names, or undefined. */
export const fieldOf = (key) => BY_KEY.get(key);

/** The fields of one repeated section, in declaration order. */
export const sectionFields = (section) => FIELDS.filter((f) => f.section === section);
