// The playground, driven as a visitor would: build site/, serve it, load the sample CV and fill
// every fixture from the picker. The assertions are the ones that make the page worth
// publishing: it runs the measured engine (its counts equal `npm run measure`'s for the same
// CV), it never shows a wrong fill, and it talks to nothing but its own origin.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium } from '../tools/chromium.mjs';
import { buildPlayground, serveSite } from '../tools/playground.mjs';
import { bundleContent } from '../tools/bundle.mjs';
import { toEntries, toProfile } from '../src/shared/cvdoc.js';
import { RUNNER_BODY, SAMPLE_EXTRAS, tally } from './scoring.js';

const chromium = await loadChromium();
const HERE = fileURLToPath(new URL('.', import.meta.url));

const fails = [];
function check(name, ok, detail = '') {
  if (!ok) fails.push(name);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `: ${detail}` : ''}`);
}

const list = await buildPlayground();
const server = await serveSite();
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const foreign = [];
page.on('request', (req) => {
  if (!req.url().startsWith(base)) foreign.push(req.url());
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/** Press Fill and wait for the result, or fail at once on a script error, not after a timeout. */
async function fill(path) {
  const before = await page.evaluate(() => window.__errors);
  await page.evaluate(() => {
    window.__lastResult = null;
  });
  await page.click('#fill');
  await page.waitForFunction(
    ([p, n]) =>
      (window.__lastResult?.fixture === p && document.body.dataset.state === 'done') || window.__errors > n,
    [path, before],
  );
  const result = await page.evaluate(() => window.__lastResult);
  if (!result) throw new Error(`the page threw while filling ${path}: ${errors.at(-1)}`);
  return result;
}

// The reference: the measurement's own runner, on the CvDoc as stored, in the same browser.
const cv = JSON.parse(readFileSync(join(HERE, 'cv.fixture.json'), 'utf8'));
const engine = `${bundleContent(join(HERE, '..'))}
  const __resolver = createResolver({ lexicons: EPIMONI_PACKS, autocomplete: EPIMONI_AUTOCOMPLETE });`;
const runner = `const profile = ${JSON.stringify(toProfile(cv, SAMPLE_EXTRAS))}; const entries = ${JSON.stringify(toEntries(cv))};\n${RUNNER_BODY}`;
async function reference(path) {
  const ref = await browser.newPage();
  await ref.goto(`${base}/fixtures/${path}`, { waitUntil: 'load' });
  const rows = [];
  for (const frame of ref.frames()) rows.push(...(await frame.evaluate(`(() => { ${engine} ${runner} })()`)));
  await ref.close();
  return tally(rows);
}

// Counted in the page too, so `fill` can stop waiting the moment one happens.
await page.addInitScript(() => {
  window.__errors = 0;
  window.addEventListener('error', () => {
    window.__errors += 1;
  });
  window.addEventListener('unhandledrejection', () => {
    window.__errors += 1;
  });
});
await page.goto(`${base}/`);
await page.waitForSelector('body[data-state="ready"]');
await page.click('#sample');
await page.waitForFunction(() => document.querySelector('[data-path="basics.name"]').value !== '');
check(
  'the sample CV loads into the form',
  (await page.inputValue('[data-path="basics.name"]')) === 'Camille Dupont-Mercier',
);
check(
  'every measured fixture is offered',
  (await page.locator('#fixture option').count()) === list.length,
  `${list.length}`,
);

for (const f of list) {
  await page.selectOption('#fixture', f.path);
  const result = await fill(f.path);
  const got = result.tally;
  // The table is what a visitor reads: one row per annotated control.
  const shown = await page.locator('#rows:not([hidden]) tbody tr').count();
  check(`${f.path}: the result table lists every field`, shown === result.rows.length, `${shown} rows`);
  const want = await reference(f.path);
  const same = ['hit', 'wrong', 'miss', 'soft', 'ok', 'ai', 'nodata'].every((k) => got[k] === want[k]);
  check(
    `${f.path}: same verdicts as the measurement, 0 wrong`,
    same && got.wrong === 0,
    `hit ${got.hit}/${got.fillable}, left alone ${got.ok}, no-data ${got.nodata}${same ? '' : ` (measure: ${JSON.stringify(want)})`}`,
  );
  if (f.path === 'traps.html')
    check(
      'traps.html: every control left alone',
      got.hit === 0 && got.wrong === 0 && got.ok === f.traps,
      `${got.ok}/${f.traps}`,
    );
}

// A visitor's own CV, not the sample: clearing the phone turns that field into "not in your CV"
// rather than a miss: the page must blame the CV's gap, not the engine.
await page.selectOption('#fixture', 'france-travail.html');
await page.fill('[data-path="basics.phone"]', '');
const phone = (await fill('france-travail.html')).rows.find((r) => r.expect === 'phone');
check(
  'a field the CV lacks reads as "not in your CV", not as a miss',
  phone?.verdict === 'nodata',
  phone?.verdict,
);

// The CV survives a reload, and only in this browser.
await page.reload();
await page.waitForSelector('body[data-state="ready"]');
check('the edited CV is remembered locally', (await page.inputValue('[data-path="basics.phone"]')) === '');

check("no request leaves the page's own origin", foreign.length === 0, foreign.slice(0, 3).join(' '));
check('no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();
console.log(`\n${fails.length ? `FAILED: ${fails.join(', ')}` : 'all playground checks passed'}`);
process.exit(fails.length ? 1 : 0);
