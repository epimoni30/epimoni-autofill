// SPDX-License-Identifier: Apache-2.0
// A language pack, empty. Copy it to <lang>.js (ISO 639-1: de.js, it.js, pt.js…), fill in what
// your language says, add one import line to index.js, and run `npm run check`.
//
// Rules the build enforces:
//   - every key and section must exist in src/schema/fields.js (they are all listed below);
//   - phrases are lowercase, unaccented words separated by single spaces, because labels
//     are normalised before matching: "Prénom :" is matched as "prenom";
//   - leave out what you do not know. An empty list costs nothing; a wrong phrase can fill
//     the wrong field, and a wrong value in a submitted application cannot be taken back.
//
// How matching works, in one paragraph: a control's label, placeholder, name and nearby text
// are compared with every key's `any` phrases (the longest match wins); a key whose `not`
// phrase appears in the label is ruled out whatever it scored. Add a `not` for every way
// your new phrase could be misread: "nom" is a surname, but "nom de l'entreprise" is not.
// Scoped keys (`work.company`) only exist inside a block of that CV section, which is
// recognised from a heading that matches one of the `sections` phrases exactly.

export default {
  lang: 'xx',
  // Words that say a question is about someone else: emergency contact, referee, spouse…
  thirdParty: [],
  // Words that decorate a section heading: "your", "optional", "required"…
  captionFiller: [],
  dates: {
    // Month-name prefixes → month number: { jan: 1, feb: 2, … }. Prefixes, not whole words.
    months: {},
    // Words meaning "ongoing" in a CV date, matched in the raw lowercased text: "present"…
    ongoing: [],
  },
  // Section headings, exactly as a form writes them once decoration is stripped.
  sections: {
    work: { any: [] },
    volunteer: { any: [] },
    education: { any: [] },
    awards: { any: [] },
    certificates: { any: [] },
    publications: { any: [] },
    skills: { any: [] },
    languages: { any: [] },
    interests: { any: [] },
    references: { any: [] },
    projects: { any: [] },
  },
  keys: {
    // ── asked once per form
    given_name: { any: [], not: [] }, // short
    family_name: { any: [], not: [] }, // short
    full_name: { any: [], not: [] }, // short
    email: { any: [], not: [] }, // short
    email_confirm: { any: [], not: [] }, // short
    phone: { any: [], not: [] }, // short
    street: { any: [], not: [] }, // any
    postal_code: { any: [], not: [] }, // short
    city: { any: [], not: [] }, // any, may be a dropdown
    country: { any: [], not: [] }, // any, may be a dropdown
    linkedin_url: { any: [], not: [] }, // any
    github_url: { any: [], not: [] }, // any
    portfolio_url: { any: [], not: [] }, // any
    current_title: { any: [], not: [] }, // any
    current_employer: { any: [], not: [] }, // any
    summary: { any: [], not: [] }, // long
    cover_letter: { any: [], not: [] }, // long
    years_experience: { any: [], not: [] }, // any, may be a dropdown
    salary_expectation: { any: [], not: [] }, // any
    notice_period: { any: [], not: [] }, // any, may be a dropdown
    availability_date: { any: [], not: [] }, // any, may be a dropdown
    work_authorization: { any: [], not: [] }, // any, may be a dropdown
    education_degree: { any: [], not: [] }, // any, may be a dropdown
    education_institution: { any: [], not: [] }, // any
    skills: { any: [], not: [] }, // any
    languages: { any: [], not: [] }, // any, may be a dropdown
    cv_file: { any: [], not: [] }, // file: a file input only, the CV's own upload
    // ── work (inside a block of this section only)
    'work.position': { any: [], not: [] }, // any
    'work.company': { any: [], not: [] }, // any
    'work.location': { any: [], not: [] }, // any
    'work.url': { any: [], not: [] }, // any
    'work.start': { any: [], not: [] }, // date, may be a dropdown
    'work.end': { any: [], not: [] }, // date, may be a dropdown
    'work.description': { any: [], not: [] }, // long
    // ── volunteer (inside a block of this section only)
    'volunteer.position': { any: [], not: [] }, // any
    'volunteer.organization': { any: [], not: [] }, // any
    'volunteer.start': { any: [], not: [] }, // date, may be a dropdown
    'volunteer.end': { any: [], not: [] }, // date, may be a dropdown
    'volunteer.description': { any: [], not: [] }, // long
    // ── education (inside a block of this section only)
    'education.institution': { any: [], not: [] }, // any
    'education.degree': { any: [], not: [] }, // any, may be a dropdown
    'education.field': { any: [], not: [] }, // any
    'education.start': { any: [], not: [] }, // date, may be a dropdown
    'education.end': { any: [], not: [] }, // date, may be a dropdown
    'education.score': { any: [], not: [] }, // any
    'education.details': { any: [], not: [] }, // long
    // ── awards (inside a block of this section only)
    'awards.title': { any: [], not: [] }, // any
    'awards.awarder': { any: [], not: [] }, // any
    'awards.date': { any: [], not: [] }, // date, may be a dropdown
    'awards.description': { any: [], not: [] }, // long
    // ── certificates (inside a block of this section only)
    'certificates.name': { any: [], not: [] }, // any
    'certificates.issuer': { any: [], not: [] }, // any
    'certificates.date': { any: [], not: [] }, // date, may be a dropdown
    'certificates.url': { any: [], not: [] }, // any
    // ── publications (inside a block of this section only)
    'publications.name': { any: [], not: [] }, // any
    'publications.publisher': { any: [], not: [] }, // any
    'publications.date': { any: [], not: [] }, // date, may be a dropdown
    'publications.url': { any: [], not: [] }, // any
    'publications.description': { any: [], not: [] }, // long
    // ── skills (inside a block of this section only)
    'skills.name': { any: [], not: [] }, // any
    'skills.level': { any: [], not: [] }, // any, may be a dropdown
    'skills.keywords': { any: [], not: [] }, // any
    // ── languages (inside a block of this section only)
    'languages.language': { any: [], not: [] }, // any, may be a dropdown
    'languages.fluency': { any: [], not: [] }, // any, may be a dropdown
    // ── interests (inside a block of this section only)
    'interests.name': { any: [], not: [] }, // any
    'interests.keywords': { any: [], not: [] }, // any
    // ── references (inside a block of this section only)
    'references.name': { any: [], not: [] }, // any
    'references.reference': { any: [], not: [] }, // long
    // ── projects (inside a block of this section only)
    'projects.name': { any: [], not: [] }, // any
    'projects.url': { any: [], not: [] }, // any
    'projects.start': { any: [], not: [] }, // date, may be a dropdown
    'projects.end': { any: [], not: [] }, // date, may be a dropdown
    'projects.description': { any: [], not: [] }, // long
  },
};
