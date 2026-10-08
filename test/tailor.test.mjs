// A CV adapted to an advert: the writer's change keys land on the right fields of a copy, what
// the user wrote around them survives, and nothing the model got wrong breaks the document.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fieldCurrent, normalizeCvDoc } from '../src/shared/cvdoc.js';
import { applyRewrite } from '../src/epimoni/tailor.js';

const cv = normalizeCvDoc(JSON.parse(readFileSync(new URL('./cv.fixture.json', import.meta.url), 'utf8')));

test('each change key lands on its field, and the original is left as it was', () => {
  const before = JSON.stringify(cv);
  const { cv: out, applied } = applyRewrite(cv, [
    {
      key: 'title',
      improved: 'Cheffe de projet digital · SEO et contenus',
      reason: 'Le titre reprend le poste visé.',
    },
    { key: 'summary', improved: 'Six ans de gestion de projets web.', reason: 'r' },
    { key: 'experience.1.title', improved: 'Chargée de projet web', reason: 'r' },
    {
      key: 'experience.0.bullets',
      improved: '• Piloté la refonte du site\n- Réduit le délai de mise en ligne de 30 %',
      reason: 'r',
    },
  ]);
  assert.equal(JSON.stringify(cv), before, 'the source document is not modified');
  assert.equal(fieldCurrent(out.basics.label), 'Cheffe de projet digital · SEO et contenus');
  assert.equal(fieldCurrent(out.basics.summary), 'Six ans de gestion de projets web.');
  assert.equal(fieldCurrent(out.work[1].position), 'Chargée de projet web');
  assert.deepEqual(
    out.work[0].highlights.map((h) => h.text),
    ['Piloté la refonte du site', 'Réduit le délai de mise en ligne de 30 %'],
  );
  assert.equal(applied.length, 4);
  assert.equal(applied[0].reason, 'Le titre reprend le poste visé.');
  assert.equal(fieldCurrent(out.basics.name), fieldCurrent(cv.basics.name), 'untouched fields come across');
});

test('lists keep what the user wrote beside a name the rewrite kept', () => {
  const { cv: out } = applyRewrite(cv, [
    { key: 'skills', improved: 'SEO\nGestion de projet\nGoogle Analytics' },
    { key: 'languages', improved: 'Anglais — Courant (C1)\nFrançais — Langue maternelle' },
    { key: 'certifications', improved: 'Google Analytics Individual Qualification' },
  ]);
  assert.deepEqual(
    out.skills.map((s) => s.name),
    ['SEO', 'Gestion de projet', 'Google Analytics'],
  );
  assert.equal(out.skills[0].id, 's1', 'a kept skill keeps its id');
  assert.equal(out.languages[0].language, 'Anglais');
  assert.equal(out.languages[0].fluency, 'Courant (C1)');
  assert.equal(out.certificates[0].issuer, 'Google');
  assert.equal(out.certificates[0].date, '2022-05');
});

test('a change the document cannot take is skipped, not forced', () => {
  const { cv: out, applied } = applyRewrite(cv, [
    { key: 'experience.7.title', improved: 'Directrice' },
    { key: 'skills', improved: '   \n  ' },
    { key: 'experience.0.bullets', improved: '' },
    { key: 'education.0.area', improved: 'Marketing' },
    { key: 'summary', improved: null },
    null,
  ]);
  assert.equal(applied.length, 0);
  assert.equal(out.work.length, cv.work.length);
  assert.deepEqual(
    out.skills.map((s) => s.name),
    cv.skills.map((s) => s.name),
  );
});

test('a proposal that adds material is marked, and one that changes nothing is not shown', async () => {
  const { proposalsFrom } = await import('../src/epimoni/tailor.js');
  const before = cv.work[0].highlights.map((h) => h.text);
  const proposals = proposalsFrom(cv, [
    { key: 'title', improved: fieldCurrent(cv.basics.label) },
    { key: 'experience.0.bullets', improved: [...before, 'Pilotage du SEO du site'].join('\n') },
    { key: 'experience.0.bullets', improved: before.map((b) => `${b} (reformulé)`).join('\n') },
    { key: 'skills', improved: 'SEO\nGestion de projet\nInstagram' },
    { key: 'experience.8.title', improved: 'Inventé' },
  ]);
  assert.deepEqual(
    proposals.map((p) => [p.i, p.key, p.adds]),
    [
      [1, 'experience.0.bullets', 1],
      [2, 'experience.0.bullets', 0],
      [3, 'skills', 1],
    ],
  );
});

test('a field that was empty is an addition, whatever the model calls it', async () => {
  const { proposalsFrom } = await import('../src/epimoni/tailor.js');
  const bare = { ...cv, work: [{ ...cv.work[0], highlights: [] }] };
  const [p] = proposalsFrom(bare, [
    { key: 'experience.0.bullets', improved: 'Animation des réseaux sociaux' },
  ]);
  assert.equal(p.adds, 1);
});
