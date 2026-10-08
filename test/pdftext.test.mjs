// Reading a CV's text out of a PDF, locally. The fixtures in test/fixtures/pdf are one synthetic
// CV printed by Chrome (compressed streams, embedded CID fonts with ToUnicode maps), then
// rewritten by qpdf: packed into object streams, and encrypted with an empty user password in
// each standard handler revision (RC4 40 and 128, AES-128, AES-256). A file that needs a real
// password and an image-only "scan" are the two refusals.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pdfText } from '../src/shared/pdftext.js';
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
