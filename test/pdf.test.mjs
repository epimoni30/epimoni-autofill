// The PDF writer, checked the way a reader would check it: every cross-reference offset lands
// on its object, the text is in the file in the encoding the fonts declare, and a long CV
// turns into pages rather than running off the bottom of one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toJsonResume } from '../src/shared/cvdoc.js';
import { cvIsPrintable, encodable, pdfName, renderCvPdf, textWidth, wrap } from '../src/shared/pdf.js';

const LABELS = {
  profile: 'Profil',
  work: 'Expérience professionnelle',
  education: 'Formation',
  projects: 'Projets',
  certificates: 'Certifications',
  skills: 'Compétences',
  languages: 'Langues',
  present: "aujourd'hui",
};
const resume = toJsonResume(JSON.parse(readFileSync(new URL('./cv.fixture.json', import.meta.url), 'utf8')));
const text = (bytes) => String.fromCharCode(...bytes);

/** Every object the cross-reference table names starts exactly at its offset. */
function xrefProblems(src) {
  const start = Number(/startxref\n(\d+)/.exec(src)[1]);
  assert.ok(src.startsWith('xref', start), 'startxref points at the table');
  const [, first, count] = /xref\n(\d+) (\d+)/.exec(src.slice(start)).map(Number);
  const rows = src
    .slice(start)
    .split('\n')
    .slice(2, 2 + count);
  const problems = [];
  rows.forEach((row, i) => {
    if (i + first === 0) return;
    const at = Number(row.slice(0, 10));
    if (!src.startsWith(`${i + first} 0 obj`, at)) problems.push(i + first);
  });
  return problems;
}

test('the file is a well-formed PDF whose offsets all land on their objects', () => {
  const src = text(renderCvPdf(resume, LABELS));
  assert.ok(src.startsWith('%PDF-1.4\n'));
  assert.ok(src.endsWith('%%EOF\n'));
  assert.deepEqual(xrefProblems(src), []);
  // 7-bit throughout, which is what makes character offsets byte offsets.
  assert.ok([...src].every((c) => c.charCodeAt(0) < 128));
  // Each stream's /Length is its exact size.
  for (const [, len, body] of src.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g))
    assert.equal(body.length, Number(len));
});

test('the same CV gives the same bytes', () => {
  assert.deepEqual(renderCvPdf(resume, LABELS), renderCvPdf(resume, LABELS));
});

test('accents are written in the encoding the fonts declare', () => {
  const src = text(renderCvPdf(resume, LABELS));
  assert.match(src, /\/Encoding \/WinAnsiEncoding/);
  // "Formation" is plain; "Expérience" carries é as octal 351 (0xE9 in WinAnsi).
  assert.match(src, /\(EXP\\311RIENCE PROFESSIONNELLE\)/);
  assert.match(src, /\(Camille Dupont-Mercier\)/);
});

test('what the fonts cannot draw loses its accent, or becomes "?"', () => {
  assert.equal(encodable('Œuvre, œil, 12 €, « oui »'), 'Œuvre, œil, 12 €, « oui »');
  assert.equal(encodable('Łódź'), 'Lódz');
  assert.equal(encodable('日本 🚀'), '?? ?');
  assert.equal(encodable('a\n\tb c'), 'a b c');
});

test('wrapping keeps every line inside the width', () => {
  const long =
    'Pilotage de la refonte du tunnel de commande, coordination de six équipes et suivi des indicateurs '.repeat(
      4,
    );
  const lines = wrap(long, 10, 200);
  assert.ok(lines.length > 4);
  for (const l of lines) assert.ok(textWidth(l, 10) <= 200, l);
  // A word longer than the line is cut rather than left to overflow.
  for (const l of wrap('x'.repeat(300), 10, 100)) assert.ok(textWidth(l, 10) <= 100);
});

test('a long CV becomes several pages', () => {
  const big = {
    ...resume,
    work: Array.from({ length: 60 }, (_, i) => ({
      name: `Entreprise ${i}`,
      position: 'Cheffe de projet',
      startDate: '2010',
      highlights: ['Une réalisation détaillée qui prend la place d’une ligne ou deux sur la page.'],
    })),
  };
  const src = text(renderCvPdf(big, LABELS));
  const count = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(src)[1]);
  assert.ok(count >= 3, `${count} pages`);
  assert.deepEqual(xrefProblems(src), []);
});

test('a name alone is not sent to an employer', () => {
  assert.equal(cvIsPrintable({ basics: { name: 'Camille' } }), false);
  assert.equal(cvIsPrintable({ basics: { name: 'Camille' }, skills: [{ name: 'SEO' }] }), true);
  assert.equal(cvIsPrintable(resume), true);
});

test('the file is named after the person, without accents', () => {
  assert.equal(pdfName({ basics: { name: 'Inès Garnier-Léon' } }), 'CV-Ines-Garnier-Leon.pdf');
  assert.equal(pdfName({}), 'CV.pdf');
});
