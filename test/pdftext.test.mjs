// Reading a CV's text out of a PDF, locally. The fixtures in test/fixtures/pdf are one synthetic
// CV printed by Chrome (compressed streams, embedded CID fonts with ToUnicode maps), then
// rewritten by qpdf: packed into object streams, and encrypted with an empty user password in
// each standard handler revision (RC4 40 and 128, AES-128, AES-256). A file that needs a real
// password and an image-only "scan" are the two refusals.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pdfText, repairDetachedAccents } from '../src/shared/pdftext.js';
import { md5 } from '../src/shared/pdfcrypt.js';
import { renderCvPdf } from '../src/shared/pdf.js';
import { toJsonResume } from '../src/shared/cvdoc.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/pdf/${name}.pdf`, import.meta.url));
const EXPECTED = [
  'Camille Dupont-Mercier',
  'Cheffe de projet digital',
  'camille.dupont@example.org',
  'Gestion de projet · SEO · Figma',
  'Français : langue maternelle',
  "Refonte du tunnel d'achat, +18 % de conversion.",
  'Cheffe de projet digital, Maison Lemoine, Rennes',
  "2019 – aujourd'hui",
  'Master Marketing digital, IAE Nantes, 2016',
];

test('MD5 matches the RFC 1321 test vectors', () => {
  const hex = (s) =>
    [...md5(new TextEncoder().encode(s))].map((b) => b.toString(16).padStart(2, '0')).join('');
  assert.equal(hex(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(hex('abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(hex('message digest'), 'f96b697d7cb7938d525a2f31aaf161d0');
  assert.equal(
    hex('12345678901234567890123456789012345678901234567890123456789012345678901234567890'),
    '57edf4a22be3c955ac49da2e2107b67a',
  );
});

for (const name of ['chrome', 'objstm', 'rc4-40', 'rc4-128', 'aes-128', 'aes-256']) {
  test(`${name}: every line of the CV comes out, words spaced and accents intact`, async () => {
    const { text, pages, problem } = await pdfText(fixture(name));
    assert.equal(problem, null);
    assert.equal(pages, 1);
    const lines = text.split('\n');
    for (const want of EXPECTED) assert.ok(lines.includes(want), `missing line: ${want}\n---\n${text}`);
  });
}

test('a file that needs a real password is refused as encrypted, not read as noise', async () => {
  const r = await pdfText(fixture('password'));
  assert.equal(r.problem, 'encrypted');
  assert.equal(r.text, '');
});

test('a scan has no text layer, and says so', async () => {
  assert.equal((await pdfText(fixture('scan'))).problem, 'no-text');
});

test('something that is not a PDF is said to be one thing: not a PDF', async () => {
  assert.equal((await pdfText(new TextEncoder().encode('{"basics":{}}'))).problem, 'not-pdf');
});

test("our own CV PDF reads back, the writer's uncompressed Helvetica included", async () => {
  const cv = JSON.parse(readFileSync(new URL('./cv.fixture.json', import.meta.url), 'utf8'));
  const { text, problem } = await pdfText(renderCvPdf(toJsonResume(cv), {}));
  assert.equal(problem, null);
  assert.match(text, /Camille Dupont-Mercier/);
  assert.match(text, /Gestion de projet/);
});

// LaTeX draws `\'e` as an acute glyph then an e, and a text layer keeps them apart. The
// shapes below are the ones read off a real LaTeX CV (pdf.js and this parser), plus the
// ASCII characters that must never be mistaken for an accent.
test('accents a LaTeX PDF split off go back on their letter', () => {
  const cases = [
    ['Soci\u00b4et\u00b4e G\u00b4en\u00b4erale', 'Soci\u00e9t\u00e9 G\u00e9n\u00e9rale'],
    ['Soci \u0301et \u0301e', 'Soci\u00e9t\u00e9'],
    ['Sosth`ene', 'Sosth\u00e8ne'],
    ['Ma^itre', 'Ma\u00eetre'],
    ['na\u00a8ive', 'na\u00efve'],
    ['Franc\u00b8ais', 'Fran\u00e7ais'],
    ['Franc \u00b8ais', 'Fran\u00e7ais'],
    ['travail `a Paris', 'travail \u00e0 Paris'],
    ["l' \u00b4Ecole", "l' \u00c9cole"],
  ];
  for (const [input, want] of cases) assert.equal(repairDetachedAccents(input), want, input);
});

test('text that was never split is left alone', () => {
  const untouched = [
    'Fran\u00e7ais d\u00e9j\u00e0, cr\u00e9\u00e9e',
    '~5 ans, x^2, `code`, it`s, C++ ~ Java',
    'Ma^\u0131tre',
    '',
  ];
  for (const text of untouched) assert.equal(repairDetachedAccents(text), text, text);
  // A decomposed "\u00e9" (macOS) is composed in place, not moved onto the next letter.
  assert.equal(repairDetachedAccents('cre\u0301e\u0301e'), 'cr\u00e9\u00e9e');
});
