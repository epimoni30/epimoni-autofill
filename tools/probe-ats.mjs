// SPDX-License-Identifier: Apache-2.0
// `npm run probe:ats -- <apply-url> [<apply-url> ...]`: what the shipped engine would do on a
// real application page, field by field.
//
// Reconnaissance, not a test. Our fixtures are reconstructions, so this is how a shape that
// only exists in the wild gets found: run it on a public Lever, Greenhouse, Ashby or Workable
// apply page, read the table, and rebuild any miss as a fixture in your own words.
//
// It can't apply for anything. Every request that isn't a GET is aborted before it leaves the
// browser, except a GraphQL query (Ashby loads its form with one); a GraphQL mutation, which
// is what a submission would be, is aborted like the rest. Nothing is clicked. The browser
// profile is a throwaway, so none of your cookies or sessions are involved.
//
// The CV is test/cv.fixture.json, a made-up person. Use pages that need no login.
//
// Columns: decision, key, then what was written ("= …") or why nothing was ("(reason)"), then
// the control and the text it was matched on. `--shots=<dir>` also saves a full-page
// screenshot of each page after the fill.

import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toEntries, toProfile } from '../src/shared/cvdoc.js';
import { SAMPLE_EXTRAS } from '../test/scoring.js';
import { bundleContent } from './bundle.mjs';
import { loadChromium } from './chromium.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const shots = args.find((a) => a.startsWith('--shots='))?.slice('--shots='.length);
const urls = args.filter((a) => !a.startsWith('--'));
if (!urls.length) {
  console.error('usage: npm run probe:ats -- <apply-url> [<apply-url> ...] [--shots=<dir>]');
  process.exit(2);
}

const cv = JSON.parse(readFileSync(join(ROOT, 'test/cv.fixture.json'), 'utf8'));
const profile = toProfile(cv, SAMPLE_EXTRAS);
const entries = toEntries(cv);
const engine = `${bundleContent(ROOT)}
  const __resolver = createResolver({ lexicons: EPIMONI_PACKS, autocomplete: EPIMONI_AUTOCOMPLETE });`;

// Runs in the page. The text shown for a control is the strongest one the engine had: a real
// label first, then the text around it, then whatever came first.
const RUN = `
  const files = { cv_file: { name: 'cv.pdf', load: () => new File(['%PDF-1.4 sample'], 'cv.pdf', { type: 'application/pdf' }) } };
  const shown = (sources) =>
    (sources.find((s) => ['label', 'aria-label', 'aria-labelledby', 'legend'].includes(s.kind)) ||
      sources.find((s) => s.kind === 'nearby') || sources[0] || {}).text || '';
  const keyOf = (d) => (d.key ? (d.index != null ? d.key + '[' + d.index + ']' : d.key) : null);
  return runFill({ root: document, url: location.href, profile, entries, files, resolver: __resolver, fillers: EPIMONI_FILLERS })
    .then((run) => ({
      errors: run.errors.map(String),
      rows: run.rows.map((r) => ({
        text: shown(r.bundle.sources),
        control: r.el.tagName.toLowerCase() + ':' + (r.el.type || r.el.getAttribute('role') || ''),
        action: r.decision.action,
        key: keyOf(r.decision),
        reason: r.decision.reason || null,
        wrote: r.wrote ? String(r.wrote.value?.name ? 'file ' + r.wrote.value.name : r.wrote.value).slice(0, 60) : null,
        filler: r.owner || null,
      })),
      radios: run.radioRows.map(({ group, decision: d, chosen }) => ({
        text: shown(radioGroupBundle(group).sources),
        action: d.action,
        key: d.key || null,
        chosen: chosen ? chosen.value : null,
      })),
    }));`;

const chromium = await loadChromium();
const browser = await chromium.launch();
if (shots) await mkdir(shots, { recursive: true });
let n = 0;
for (const url of urls) {
  n += 1;
  console.log(`\n${url}`);
  const page = await browser.newPage();
  await page.route('**/*', (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.continue();
    if (/graphql/i.test(req.url()) && !/\bmutation\b/i.test(req.postData() || '')) return route.continue();
    return route.abort();
  });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  } catch (e) {
    console.log(`  (page did not settle: ${e.message.split('\n')[0]}; measuring what loaded)`);
  }
  await page.waitForTimeout(2000);
  for (const frame of page.frames()) {
    let got;
    try {
      got = await frame.evaluate(
        `(async () => { const profile = ${JSON.stringify(profile)}; const entries = ${JSON.stringify(entries)}; ${engine} ${RUN} })()`,
      );
    } catch (e) {
      console.log(`  frame ${frame.url().slice(0, 60)}: ${e.message.split('\n')[0]}`);
      continue;
    }
    if (!got.rows.length && !got.radios.length) continue;
    if (frame !== page.mainFrame()) console.log(`  in frame ${frame.url().slice(0, 80)}`);
    if (got.errors.length) console.log('  filler errors:', got.errors.join('; '));
    for (const r of got.rows)
      console.log(
        `  ${r.action.padEnd(12)} ${String(r.key).padEnd(24)} ${(r.wrote ? `= ${JSON.stringify(r.wrote)}` : `(${r.reason || ''})`).padEnd(40)} ${r.control} "${r.text.slice(0, 60)}"${r.filler ? ` [${r.filler}]` : ''}`,
      );
    for (const r of got.radios)
      console.log(
        `  ${r.action.padEnd(12)} ${String(r.key).padEnd(24)} ${(r.chosen ? `= ${JSON.stringify(r.chosen)}` : '(none chosen)').padEnd(40)} radio group "${r.text.slice(0, 60)}"`,
      );
  }
  if (shots)
    await page.screenshot({ path: join(shots, `${n}-${new URL(url).hostname}.png`), fullPage: true });
  await page.close();
}
await browser.close();
