// The backend parser's fields as a CvDoc: every section lands where the editor and the fill
// read it, periods stay the CV's own words, and nothing absent is invented.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldCurrent, toProfile } from '../src/shared/cvdoc.js';
import { fromExtraction, splitPeriod } from '../src/epimoni/import.js';

test('a period splits into its two ends, in the words the CV used', () => {
  assert.deepEqual(splitPeriod('Jan 2021 – Mar 2023'), ['Jan 2021', 'Mar 2023']);
  assert.deepEqual(splitPeriod("2019 - aujourd'hui"), ['2019', "aujourd'hui"]);
  assert.deepEqual(splitPeriod('2016–2019'), ['2016', '2019']);
  assert.deepEqual(splitPeriod('septembre 2018 à juin 2020'), ['septembre 2018', 'juin 2020']);
  assert.deepEqual(splitPeriod('2016', 'end'), ['', '2016'], 'a diploma with one date is when it ended');
  assert.deepEqual(splitPeriod(null), ['', '']);
});

test('the parser fields become a CV the fill can use', () => {
  const cv = fromExtraction({
    contact: {
      name: 'Camille Dupont',
      email: 'c@example.org',
      phone: '+33 6 12 34 56 78',
      location: 'Nantes',
      linkedin: 'https://www.linkedin.com/in/camille',
      portfolio: null,
    },
    title: 'Cheffe de projet digital',
    summary: null,
    experiences: [
      {
        title: 'Cheffe de projet',
        company: 'Maison Lemoine',
        period: "2019 – aujourd'hui",
        location: 'Rennes',
        bullets: ['Refonte du tunnel', '  '],
      },
    ],
    education: [{ degree: 'Master Marketing', institution: 'IAE Nantes', period: '2016', details: null }],
    skills: ['SEO', '', 'Figma'],
    languages: [
      { language: 'Anglais', level: 'C1' },
      { language: '', level: 'B2' },
    ],
    certifications: ['Google Analytics'],
  });
  assert.equal(fieldCurrent(cv.basics.name), 'Camille Dupont');
  assert.equal(cv.basics.location.city, 'Nantes');
  assert.equal(fieldCurrent(cv.basics.label), 'Cheffe de projet digital');
  assert.equal(fieldCurrent(cv.basics.summary), '', 'no summary is invented');
  assert.deepEqual(cv.basics.profiles, [{ network: 'LinkedIn', url: 'https://www.linkedin.com/in/camille' }]);
  assert.equal(cv.work[0].name, 'Maison Lemoine');
  assert.equal(fieldCurrent(cv.work[0].position), 'Cheffe de projet');
  assert.deepEqual([cv.work[0].startDate, cv.work[0].endDate], ['2019', "aujourd'hui"]);
  assert.deepEqual(
    cv.work[0].highlights.map((h) => h.text),
    ['Refonte du tunnel'],
  );
  assert.deepEqual(
    [cv.education[0].area, cv.education[0].institution, cv.education[0].endDate],
    ['Master Marketing', 'IAE Nantes', '2016'],
  );
  assert.deepEqual(
    cv.skills.map((s) => s.name),
    ['SEO', 'Figma'],
  );
  assert.deepEqual(
    cv.languages.map((l) => [l.language, l.fluency]),
    [['Anglais', 'C1']],
  );
  assert.equal(cv.certificates[0].name, 'Google Analytics');
  const profile = toProfile(cv);
  assert.equal(profile.email, 'c@example.org');
  assert.equal(profile.city, 'Nantes');
});

test('an empty answer is an empty CV, not a crash', () => {
  const cv = fromExtraction(null);
  assert.equal(fieldCurrent(cv.basics.name), '');
  assert.deepEqual(cv.work, []);
});
