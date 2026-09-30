// The CV in memory: what `normalizeCvDoc` accepts, and what it guarantees to whoever reads
// the document afterwards.
//
// Three writers put a document here, the site's pairing hand-off, a JSON file the user
// imports, and the extension's own editor, and three readers take it back out: `toProfile`
// fills a form from it, `POST /ml/analyse/cvVSoffer-doc` scores it against an advert
// (flattened server-side), and the editor re-renders it. Every
// test here is about a shape that used to differ between two of those.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyCv,
  cvIsAnalysable,
  cvSummary,
  fieldCurrent,
  fromJsonResume,
  jsonResumeProblems,
  normalizeCvDoc,
  toIso8601,
  toJsonResume,
  toEntries,
  toProfile,
  yearsOfExperience,
} from '../src/shared/cvdoc.js';

test('a plain JSON Résumé export is accepted without a translation layer', async () => {
  // The open CV structure the whole product is built on. Somebody arriving with a file from
  // elsewhere is the point of the import button, so the fields that differ from ours,
  // `location` as an object, `highlights` as bare strings, `skills` as strings, all land.
  const cv = normalizeCvDoc({
    basics: {
      name: 'Camille Dupont',
      label: 'Développeuse Python',
      email: 'c@example.org',
      phone: '+33 6 00 00 00 00',
      location: { city: 'Lyon', countryCode: 'FR' },
      summary: 'Huit ans de back-end.',
      profiles: [{ network: 'LinkedIn', url: 'https://linkedin.com/in/camille' }],
    },
    work: [
      {
        name: 'Acme',
        position: 'Développeuse',
        startDate: '2018-01',
        endDate: '2024-06',
        highlights: ['API de paiement', 'Migration Postgres'],
      },
    ],
    education: [{ institution: 'INSA Lyon', area: 'Informatique', startDate: '2013', endDate: '2016' }],
    skills: ['Python', 'PostgreSQL'],
    languages: [{ language: 'Français', fluency: 'Natif' }],
  });

  const profile = toProfile(cv);
  assert.equal(profile.full_name, 'Camille Dupont');
  assert.equal(profile.city, 'Lyon');
  assert.equal(profile.current_title, 'Développeuse Python');
  assert.equal(profile.current_employer, 'Acme');
  assert.equal(profile.linkedin_url, 'https://linkedin.com/in/camille');
  assert.equal(profile.skills, 'Python, PostgreSQL');
  assert.equal(cv.work[0].highlights.map((h) => h.text).join('|'), 'API de paiement|Migration Postgres');
  // `countryCode` is not ours and is not dropped: an import that loses data the user can see
  // in their own file is a bug, and nothing here is a whitelist.
  assert.equal(cv.basics.location.countryCode, 'FR');
});

test('normalising is idempotent, because the document is re-normalised on every save', async () => {
  // The editor collects the form into a document and saves it, and the worker normalises it
  // again on the way in. A second pass that changed anything would make a CV drift every time
  // it was opened and saved.
  const once = normalizeCvDoc({
    basics: { name: 'X', label: { text: 'Dev' } },
    work: [{ name: 'Acme', highlights: [{ text: 'a' }] }],
  });
  assert.deepEqual(normalizeCvDoc(once), once);
});

test('a builder document keeps its {text} wrappers readable', async () => {
  // What the site hands over. `fieldCurrent` is the third copy of the vitrine's reader and
  // its Python twin; reading `.text` directly is what fills a form with "[object Object]".
  const cv = normalizeCvDoc({
    basics: { name: 'Y', label: { text: 'Chef de projet' }, summary: { text: 'Résumé' } },
    work: [{ name: 'Beta', position: { text: 'Chef de projet' } }],
  });
  assert.equal(fieldCurrent(cv.basics.label), 'Chef de projet');
  assert.equal(toProfile(cv).current_title, 'Chef de projet');
});

test('a reverted AI diff reads as the original, not the proposal', async () => {
  // The one polymorphic case that is not about convenience: a document saved by the old AI
  // viewer carries `{diff}`, and `reverted` means the user rejected the proposal. Filling a
  // form with the rejected text would submit words they explicitly refused.
  const cv = normalizeCvDoc({
    basics: {
      name: 'Z',
      label: {
        diff: {
          reverted: true,
          tokens: [
            { t: 'del', s: 'Ancien titre' },
            { t: 'add', s: 'Titre proposé' },
          ],
        },
      },
    },
  });
  assert.equal(fieldCurrent(cv.basics.label), 'Ancien titre');
});

test('the site draft wrapper unwraps, so exporting and re-importing works', async () => {
  // `{cv, builderId, title}` is what the site keeps in localStorage and what our own export
  // writes back out.
  const cv = normalizeCvDoc({ cv: { basics: { name: 'Camille' } }, builderId: 'b-1', title: 'Mon CV' });
  assert.equal(cv.basics.name, 'Camille');
});

test('garbage normalises to the empty skeleton rather than throwing', async () => {
  for (const junk of [null, undefined, 42, 'not a cv', [], { basics: 'nonsense' }]) {
    const cv = normalizeCvDoc(junk);
    assert.deepEqual(Object.keys(createEmptyCv()).sort(), Object.keys(cv).sort());
    assert.ok(Array.isArray(cv.work) && Array.isArray(cv.skills));
  }
});

test('"analysable" is a floor on the CV, matching the 40-word floor on the advert', async () => {
  // Both sides of a comparison refuse inputs that can only produce a meaningless answer.
  // The cost of not having this is an hour of somebody's quota spent scoring a name.
  assert.equal(cvIsAnalysable(normalizeCvDoc({ basics: { name: 'Camille Dupont' } })), false);
  assert.equal(
    cvIsAnalysable(normalizeCvDoc({ work: [{ name: 'Acme' }] })),
    false,
    'a CV with no name is not one',
  );
  assert.equal(cvIsAnalysable(normalizeCvDoc({ basics: { name: 'Camille' }, skills: ['Python'] })), true);
  assert.equal(
    cvIsAnalysable(normalizeCvDoc({ basics: { name: 'Camille' }, work: [{ name: 'Acme' }] })),
    true,
  );
});

test('the summary counts what the user typed, not the rows the editor drew', async () => {
  // The editor opens with one blank experience so the page reads as a form rather than a
  // void. Counting those would tell somebody their empty CV holds an experience.
  const cv = normalizeCvDoc({
    basics: { name: 'Camille' },
    work: [{ name: '', position: '' }],
    skills: [{ name: '' }],
  });
  const s = cvSummary(cv);
  assert.equal(s.work, 0);
  assert.equal(s.skills, 0);
  assert.equal(s.name, 'Camille');
});

test('extras win over the CV, because they are the more recent human statement', async () => {
  const cv = normalizeCvDoc({ basics: { name: 'Camille Dupont', phone: '0100000000' } });
  const profile = toProfile(cv, { phone: '0600000000', notice_period: '3 mois' });
  assert.equal(profile.phone, '0600000000');
  assert.equal(profile.notice_period, '3 mois');
});

// ── JSON Résumé ────────────────────────────────────────────────────────────────────────
//
// The document we store is JSON Résumé-*shaped* and not conformant: `{text}` wrappers on
// label/summary/position, `{id, text}` highlights, free-text dates. Every one is deliberate,
// and every one would make an exported file useless to any other tool. These tests are the
// contract that the boundary translates rather than leaks.

const RICH = normalizeCvDoc({
  basics: {
    name: 'Camille Dupont',
    label: { text: 'Ingénieure SRE' },
    email: 'c@example.org',
    phone: '0612345678',
    location: 'Lyon',
    summary: { text: 'Dix ans de production.' },
    profiles: [{ network: 'LinkedIn', url: 'https://linkedin.com/in/camille' }],
  },
  work: [
    {
      name: 'Beta',
      position: { text: 'SRE' },
      startDate: 'Jan 2021',
      endDate: 'en cours',
      highlights: [{ id: 'h1', text: 'MTTR réduit de 40%' }, 'Migré 200 services'],
    },
  ],
  education: [
    { institution: 'INSA', area: 'Informatique', startDate: '2015', endDate: '09/2018', details: 'Major' },
  ],
  skills: ['Rust', { name: 'Kubernetes', keywords: ['k8s'] }],
  languages: [{ language: 'Français', fluency: 'Natif' }],
  certificates: [{ name: 'CKA', date: '12/2022', issuer: 'CNCF' }],
});

test('an exported CV is valid JSON Résumé', () => {
  assert.deepEqual(jsonResumeProblems(toJsonResume(RICH)), []);
});

test('the wrappers that are ours do not leave the building', () => {
  const out = toJsonResume(RICH);
  assert.equal(out.basics.label, 'Ingénieure SRE', 'a {text} wrapper exports as a string');
  assert.equal(out.basics.summary, 'Dix ans de production.');
  assert.equal(out.work[0].position, 'SRE');
  // A highlight is `{id, text}` here and a bare string in the standard. Exporting the object
  // is what would render as "[object Object]" in somebody else's theme.
  assert.deepEqual(out.work[0].highlights, ['MTTR réduit de 40%', 'Migré 200 services']);
  assert.equal(out.skills[0].name, 'Rust', 'a bare-string skill exports as an object');
});

test('an ongoing role exports with no endDate, which is how the standard says "current"', () => {
  // JSON Résumé cannot write "en cours". It writes nothing, and `yearsOfExperience` already
  // reads a missing end as "until now", so the two conventions already agreed.
  const out = toJsonResume(RICH);
  assert.equal(out.work[0].startDate, '2021-01');
  assert.equal('endDate' in out.work[0], false);
  assert.equal(yearsOfExperience(RICH.work), yearsOfExperience(fromJsonResume(out).work));
});

test('dates become ISO 8601, and a bare year stays a bare year', () => {
  // The trap: defaulting an unstated month to January would export "2015" as "2015-01" and
  // silently invent a precision the person never gave.
  assert.equal(toIso8601('2015'), '2015');
  assert.equal(toIso8601('Jan 2021'), '2021-01');
  assert.equal(toIso8601('01/2021'), '2021-01');
  assert.equal(toIso8601('2021-06'), '2021-06', 'already ISO, and the month is not lost');
  assert.equal(toIso8601('été 2019'), '2019');
  assert.equal(toIso8601('en cours'), '');
  assert.equal(toIso8601(''), '');
  assert.equal(toIso8601('bientôt'), '', 'no year, nothing to say');
  assert.equal(toIso8601('outubro 2021'), '2021-10');
  assert.equal(toIso8601('aout 2021'), '2021-08', 'the pt "out" prefix does not take the French August');
  assert.equal(toIso8601('até o momento'), '');
});

test('an ISO date keeps its month through the arithmetic too', () => {
  // `yearsOfExperience` reads dates through the same parser. Before ISO input was understood,
  // "2021-06" fell through to the free-text rules and became January: a six-month error on
  // every imported résumé, visible nowhere.
  const half = yearsOfExperience([{ startDate: '2021-01', endDate: '2021-07' }], 2021 * 12 + 7);
  assert.equal(half, 0.5);
});

test('a round trip changes nothing a form would be filled from', () => {
  const back = fromJsonResume(toJsonResume(RICH));
  assert.deepEqual(toProfile(back), toProfile(RICH));
  assert.equal(back.education[0].details, 'Major');
  assert.deepEqual(
    back.meta.sectionOrder,
    RICH.meta.sectionOrder,
    "the section order is the user's, and survives",
  );
});

test("somebody else's resume.json imports without a translation layer", () => {
  // The point of storing a CV in an open format rather than merely resembling one: a file
  // from any JSON Résumé tool is accepted as it stands.
  const foreign = {
    basics: {
      name: 'Alex Martin',
      label: 'Data Engineer',
      email: 'alex@example.org',
      location: { city: 'Nantes' },
    },
    work: [{ name: 'Acme', position: 'Engineer', startDate: '2019-03', highlights: ['Built the warehouse'] }],
    education: [
      {
        institution: 'Nantes Université',
        area: 'Statistiques',
        courses: ['Bayesian methods', 'Causal inference'],
      },
    ],
    skills: [{ name: 'Python', keywords: ['pandas'] }],
  };
  const cv = fromJsonResume(foreign);
  assert.equal(fieldCurrent(cv.basics.label), 'Data Engineer');
  assert.equal(fieldCurrent(cv.basics.location.city), 'Nantes');
  assert.equal(fieldCurrent(cv.work[0].position), 'Engineer');
  assert.equal(
    cv.work[0].highlights[0].text,
    'Built the warehouse',
    'a bare-string highlight is wrapped on the way in',
  );
  // An education entry has no free-text field in the standard, so `courses` is where the
  // content is. Dropping it would import the row blank.
  assert.equal(cv.education[0].details, 'Bayesian methods · Causal inference');
  assert.equal(toProfile(cv).full_name, 'Alex Martin', 'and it fills a form immediately');
});

test('an empty CV exports as something still valid', () => {
  const out = toJsonResume(createEmptyCv());
  assert.deepEqual(jsonResumeProblems(out), []);
  assert.equal(out.basics, undefined, 'and carries no empty strings for a validator to reject');
});

// ── Entry by entry, for forms that ask for the career as repeated blocks ───────────────────

test('entries carry the fields the scoped keys name', () => {
  const e = toEntries({
    work: [
      {
        name: 'Acme',
        position: { text: 'Développeuse' },
        location: 'Lyon',
        startDate: 'Mars 2021',
        endDate: 'en cours',
        summary: 'Équipe paiement.',
        highlights: [{ id: 'h1', text: 'API' }, 'Migration'],
      },
    ],
  });
  assert.deepEqual(e.work[0], {
    position: 'Développeuse',
    company: 'Acme',
    location: 'Lyon',
    start: { raw: 'Mars 2021', y: 2021, m: 3, ongoing: false },
    end: { raw: 'en cours', y: null, m: null, ongoing: true },
    description: 'Équipe paiement.\n- API\n- Migration',
  });
});

test('a bare year stays a bare year, so no month is ever invented', () => {
  const [row] = toEntries({
    education: [{ institution: 'INSA', startDate: '2013', endDate: '2016-06' }],
  }).education;
  assert.deepEqual(row.start, { raw: '2013', y: 2013, m: null, ongoing: false });
  assert.equal(row.end.m, 6);
});

test('the degree is the studyType when there is one, the whole title otherwise', () => {
  const { education } = toEntries({
    education: [
      { institution: 'IUT', studyType: 'DUT', area: 'Informatique' },
      // The builder writes no studyType: the title lives in `area`, and is said once.
      { institution: 'Université', area: 'Master Communication' },
    ],
  });
  assert.equal(education[0].degree, 'DUT');
  assert.equal(education[0].field, 'Informatique');
  assert.equal(education[1].degree, 'Master Communication');
  assert.equal(education[1].field, undefined);
});

test('blank rows are dropped before indexing, so block k takes real entry k', () => {
  const { work } = toEntries({
    work: [{ name: 'Acme' }, { name: '', position: { text: '' } }, { name: 'Globex' }],
  });
  assert.deepEqual(
    work.map((w) => w.company),
    ['Acme', 'Globex'],
  );
  assert.deepEqual(toEntries(null), {});
  assert.deepEqual(
    toEntries({ skills: ['Python', { name: 'SQL', level: 'Avancé', keywords: ['Postgres'] }] }).skills,
    [{ name: 'Python' }, { name: 'SQL', level: 'Avancé', keywords: 'Postgres' }],
  );
});

test('every section a form can be filled from also survives an export', () => {
  // These were dropped by `toJsonResume` before: an imported résumé with projects and awards
  // exported without them.
  const doc = normalizeCvDoc({
    basics: { name: 'Camille' },
    projects: [{ name: 'Site', description: 'Refonte', startDate: '2019', highlights: ['SEO'] }],
    volunteer: [{ organization: 'Restos du cœur', position: 'Bénévole', startDate: 'Jan 2020' }],
    awards: [{ title: 'Prix X', date: '2021', awarder: 'Fondation Y' }],
    publications: [{ name: 'Article', publisher: 'Revue', releaseDate: '03/2022' }],
    interests: [{ name: 'Vélo', keywords: ['cyclotourisme'] }],
    references: [{ name: 'M. Martin', reference: 'Fiable.' }],
  });
  const out = toJsonResume(doc);
  assert.equal(out.projects[0].name, 'Site');
  assert.equal(out.projects[0].startDate, '2019');
  assert.equal(out.volunteer[0].startDate, '2020-01');
  assert.equal(out.awards[0].awarder, 'Fondation Y');
  assert.equal(out.publications[0].releaseDate, '2022-03');
  assert.deepEqual(out.interests[0].keywords, ['cyclotourisme']);
  assert.equal(out.references[0].reference, 'Fiable.');
  assert.deepEqual(jsonResumeProblems(out), []);
  // And back: what was exported fills the same blocks.
  assert.deepEqual(toEntries(fromJsonResume(out)).projects, toEntries(doc).projects);
});
