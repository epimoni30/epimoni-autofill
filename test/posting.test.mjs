// Advert extraction.
//
// Split the way the engine is: `chooseSource` is pure and tested directly, while the DOM half
// runs in a real Chromium over `test/fixtures/postings/*.html`.
//
// Those fixtures are **reconstructions**, like the form fixtures. They reproduce the page
// *structure* each board uses, which is a measured fact, established by `npm run probe`,
// with advert text written for this suite. Real captures are 750 KB of somebody else's page
// markup and copyright, so `npm run probe` writes them to an ignored `.private/` directory
// for local work and they are not redistributed.
//
// The point of the fixtures is that the two boards disagree in the way that matters: France
// Travail publishes no JobPosting and HelloWork publishes a rich one, so a change that quietly
// makes one source mandatory fails here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { chooseSource } from '../src/content/posting.js';
import { loadChromium } from '../tools/chromium.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(HERE, 'fixtures/postings');

const long = (n) => Array.from({ length: n }, (_, i) => `mot${i}`).join(' ');

test('chooseSource prefers a substantial JSON-LD description over the container heuristic', () => {
  const r = chooseSource(long(700), long(900));
  assert.equal(r.via, 'json-ld');
});

test('chooseSource falls back to the heuristic when there is no JSON-LD', () => {
  const r = chooseSource('', long(900));
  assert.equal(r.via, 'heuristic');
  assert.equal(r.words, 900);
});

test('chooseSource rejects a JSON-LD stub in favour of a much richer page', () => {
  // Some boards publish the title as the description. That is structured data, and useless.
  const r = chooseSource(long(45), long(900));
  assert.equal(r.via, 'heuristic');
});

test('chooseSource refuses when neither source clears the floor', () => {
  // A cookie wall produces text. Analysing it would spend a metered call on a cookie policy.
  const r = chooseSource(long(10), long(30));
  assert.equal(r.via, 'none');
  assert.equal(r.text, '');
});

// The DOM half needs a browser. Skipped rather than failed when a fixture is missing, so a
// checkout with none of them can still run `npm test`.
const captured = ['france-travail', 'hellowork'].filter((n) => existsSync(join(FIXTURES, `${n}.html`)));

test('extraction over the fixture boards', {
  skip: captured.length === 0 && 'no fixtures: run `npm run probe`',
}, async (t) => {
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  const source = await readFile(join(HERE, '../src/content/posting.js'), 'utf8');
  // The module is injected as a classic script the way build.mjs bundles it, so the test
  // exercises the same shape that ships rather than an ES-module import the browser
  // never sees.
  const bundled = source.replace(/^export /gm, '');

  try {
    for (const name of captured) {
      await t.test(name, async () => {
        const page = await browser.newPage();
        await page.setContent(await readFile(join(FIXTURES, `${name}.html`), 'utf8'));
        const got = await page.evaluate(
          `(() => { ${bundled}; return extractPosting(document, 'https://example/${name}'); })()`,
        );
        await page.close();

        assert.equal(got.ok, true, `${name}: extraction refused (${got.reason}, ${got.words} words)`);
        assert.ok(got.words >= 200, `${name}: only ${got.words} words recovered`);
        // The advert, not the furniture: a posting names a job and says something about it.
        assert.ok(
          !/politique de cookies|accepter les cookies/i.test(got.text.slice(0, 400)),
          `${name}: extraction starts in a cookie banner`,
        );
        console.log(`    ${name.padEnd(16)} ${String(got.words).padStart(5)}w via ${got.via}`);
      });
    }
  } finally {
    await browser.close();
  }
});

test('France Travail is read by heuristic, HelloWork by JSON-LD', {
  skip: captured.length < 2 && 'needs both fixtures',
}, async () => {
  // This is the measurement the whole module is shaped by. If France Travail ever starts
  // publishing a JobPosting this test fails, which is the right way to be told.
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  const bundled = (await readFile(join(HERE, '../src/content/posting.js'), 'utf8')).replace(/^export /gm, '');
  const via = {};
  try {
    for (const name of ['france-travail', 'hellowork']) {
      const page = await browser.newPage();
      await page.setContent(await readFile(join(FIXTURES, `${name}.html`), 'utf8'));
      via[name] = await page.evaluate(`(() => { ${bundled}; return extractPosting(document).via; })()`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  assert.equal(via['france-travail'], 'heuristic', 'France Travail publishes no JobPosting');
  assert.equal(via.hellowork, 'json-ld', 'HelloWork publishes a rich JobPosting');
});

test('the two details that were bugs first', {
  skip: captured.length < 2 && 'needs both fixtures',
}, async (t) => {
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  const bundled = (await readFile(join(HERE, '../src/content/posting.js'), 'utf8')).replace(/^export /gm, '');
  const read = async (name) => {
    const page = await browser.newPage();
    await page.setContent(await readFile(join(FIXTURES, `${name}.html`), 'utf8'));
    const got = await page.evaluate(`(() => { ${bundled}; return extractPosting(document); })()`);
    await page.close();
    return got;
  };

  try {
    await t.test('a title stated on four controls is sent once', async () => {
      // France Travail restates the job title on the heading, the apply link, the print link
      // and the locate link. Sending it four times costs prompt tokens and tells the model
      // nothing, and the fix must stay a general rule about repeated short lines, not a
      // list of that board's button labels.
      const got = await read('france-travail');
      const title = 'Technicien / Technicienne de maintenance industrielle (H/F)';
      const seen = got.text.split('\n').filter((l) => l.trim() === title).length;
      assert.equal(seen, 1, `the title survived ${seen} times`);
    });

    await t.test('a salary with a currency and no amount produces no salary line', async () => {
      // HelloWork publishes `baseSalary` with a currency and an empty QuantitativeValue. It
      // rendered as "Rémunération : EUR": a line that costs tokens and says nothing.
      const got = await read('hellowork');
      assert.equal(/^Rémunération :/m.test(got.text), false, 'an empty salary was written as a fact');
      assert.match(got.text, /^Entreprise : Vallonis$/m, 'while the facts that do exist are still written');
    });
  } finally {
    await browser.close();
  }
});
