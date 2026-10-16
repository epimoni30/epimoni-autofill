// SPDX-License-Identifier: Apache-2.0
// Property-based fuzzing of the code that reads input we don't control.
//
// The PDF reader and the JSON Résumé import take whatever file a person picks, and the label
// normaliser takes whatever text a page carries. None of them may throw, hang, or hand back
// something of the wrong shape on any input. fast-check generates the inputs, including byte
// mutations of the real PDF fixtures (truncated, flipped, spliced), which reach far deeper into
// the parser than random bytes do. A failure prints the smallest input that reproduces it.
//
// FUZZ_RUNS raises the number of cases for a long local run; CI uses the default.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import fc from 'fast-check';
import { normalize } from '../src/content/dom.js';
import { countriesIn, workRightCovers } from '../src/schema/countries.js';
import { jsonResumeProblems, normalizeCvDoc, toJsonResume } from '../src/shared/cvdoc.js';
import { pdfText } from '../src/shared/pdftext.js';

const RUNS = Number(process.env.FUZZ_RUNS) || 200;
const PDF_DIR = new URL('./fixtures/pdf/', import.meta.url);
const PDFS = readdirSync(PDF_DIR)
  .filter((f) => f.endsWith('.pdf'))
  .map((f) => new Uint8Array(readFileSync(new URL(f, PDF_DIR))));

/** A reading that takes this long on a CV-sized input is a hang. */
const TOO_SLOW_MS = 5000;
const PROBLEMS = new Set([null, 'not-pdf', 'encrypted', 'no-text']);

async function readsCleanly(bytes) {
  let timer;
  const out = await Promise.race([
    pdfText(bytes),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`pdfText took over ${TOO_SLOW_MS} ms`)), TOO_SLOW_MS);
    }),
  ]).finally(() => clearTimeout(timer));
  assert.equal(typeof out.text, 'string');
  assert.ok(Number.isInteger(out.pages) && out.pages >= 0, `pages: ${out.pages}`);
  assert.ok(PROBLEMS.has(out.problem), `problem: ${out.problem}`);
}

/** One of the real fixtures with a few bytes changed, cut, or a slice repeated. */
const mutatedPdf = fc
  .record({
    file: fc.nat({ max: PDFS.length - 1 }),
    edits: fc.array(
      fc.oneof(
        fc.record({ kind: fc.constant('set'), at: fc.nat(), byte: fc.nat({ max: 255 }) }),
        fc.record({ kind: fc.constant('cut'), at: fc.nat() }),
        fc.record({ kind: fc.constant('splice'), at: fc.nat(), from: fc.nat(), len: fc.nat({ max: 4096 }) }),
      ),
      { minLength: 1, maxLength: 8 },
    ),
  })
  .map(({ file, edits }) => {
    let b = PDFS[file];
    for (const e of edits) {
      const at = e.at % Math.max(1, b.length);
      if (e.kind === 'set') {
        b = b.slice();
        b[at] = e.byte;
      } else if (e.kind === 'cut') b = b.slice(0, at);
      else {
        const from = e.from % Math.max(1, b.length);
        const chunk = b.slice(from, from + e.len);
        const out = new Uint8Array(b.length + chunk.length);
        out.set(b.subarray(0, at));
        out.set(chunk, at);
        out.set(b.subarray(at), at + chunk.length);
        b = out;
      }
    }
    return b;
  });

test('the PDF reader survives mutated real PDFs', async () => {
  await fc.assert(fc.asyncProperty(mutatedPdf, readsCleanly), { numRuns: RUNS });
});

test('the PDF reader survives arbitrary bytes behind a PDF header', async () => {
  const header = new TextEncoder().encode('%PDF-1.7\n');
  await fc.assert(
    fc.asyncProperty(fc.uint8Array({ maxLength: 4096 }), async (tail) => {
      const bytes = new Uint8Array(header.length + tail.length);
      bytes.set(header);
      bytes.set(tail, header.length);
      await readsCleanly(bytes);
    }),
    { numRuns: RUNS },
  );
});

test('the PDF reader survives PDF-shaped token soup', async () => {
  const token = fc.constantFrom(
    '%PDF-1.4\n',
    '1 0 obj',
    'endobj',
    '<<',
    '>>',
    '[',
    ']',
    '/Type',
    '/Catalog',
    '/Pages',
    '/Page',
    '/Kids',
    '/Contents',
    '/Filter /FlateDecode',
    '/Length 99999',
    'stream\n',
    '\nendstream',
    '2 0 R',
    'trailer',
    'startxref',
    '/Encrypt 3 0 R',
    '/ObjStm',
    '(text)',
    '<00ff>',
    'BT',
    'ET',
    'Tj',
    'TJ',
    ' ',
    '\n',
  );
  await fc.assert(
    fc.asyncProperty(fc.array(token, { maxLength: 200 }), async (tokens) => {
      await readsCleanly(new TextEncoder().encode(`%PDF-1.4\n${tokens.join(' ')}`));
    }),
    { numRuns: RUNS },
  );
});

test('any JSON imports as a CV that exports as valid JSON Résumé', () => {
  fc.assert(
    fc.property(fc.jsonValue(), (value) => {
      const cv = normalizeCvDoc(value);
      assert.equal(typeof cv, 'object');
      assert.deepEqual(jsonResumeProblems(toJsonResume(cv)), []);
    }),
    { numRuns: RUNS * 5 },
  );
});

test('a JSON Résumé-shaped file with junk in every slot still imports cleanly', () => {
  const junk = fc.oneof(fc.jsonValue(), fc.string(), fc.constant(null));
  const section = fc.array(fc.dictionary(fc.string({ maxLength: 12 }), junk, { maxKeys: 6 }), {
    maxLength: 4,
  });
  const resume = fc.record(
    {
      basics: fc.dictionary(fc.string({ maxLength: 12 }), junk, { maxKeys: 8 }),
      work: section,
      education: section,
      skills: section,
      languages: section,
      certificates: section,
    },
    { requiredKeys: [] },
  );
  fc.assert(
    fc.property(resume, (value) => {
      assert.deepEqual(jsonResumeProblems(toJsonResume(normalizeCvDoc(value))), []);
    }),
    { numRuns: RUNS * 5 },
  );
});

test('label normalisation is idempotent and yields only words', () => {
  fc.assert(
    fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (s) => {
      const once = normalize(s);
      assert.match(once, /^(?:[a-z0-9]+(?: [a-z0-9]+)*)?$/);
      assert.equal(normalize(once), once);
    }),
    { numRuns: RUNS * 5 },
  );
});

test('the work authorisation check never throws and is decided by its inputs alone', () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 120 }),
      fc.string({ maxLength: 60 }),
      fc.string({ maxLength: 30 }),
      (q, a, r) => {
        const question = normalize(q);
        const first = workRightCovers(question, a, r);
        assert.equal(typeof first, 'boolean');
        assert.equal(workRightCovers(question, a, r), first);
        assert.ok(Array.isArray(countriesIn(question)));
      },
    ),
    { numRuns: RUNS * 5 },
  );
});
