// Phase 0 gate: measure the resolver against annotated fixtures.
//
// Two numbers, per fixture and overall:
//   fill rate (annotated fields filled with the right key
//   wrong fills) fields filled with the wrong key, or filled at all when the ground
//                    truth says "none"
// The second is the one that decides whether this product can ship. A missed field costs
// a keystroke; a wrong value in a submitted application cannot be taken back. The gate is
// wrong == 0.
//
// Fixtures are served over HTTP rather than file:// so that the iframe case is genuinely
// same-origin, the way an embedded ATS form is in production.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium } from '../tools/chromium.mjs';
import { toEntries, toProfile } from '../src/shared/cvdoc.js';
import { bundleContent } from '../tools/bundle.mjs';
import { RUNNER_BODY, SAMPLE_EXTRAS, verdictOf } from './scoring.js';
import { fixtureList } from './fixture-list.mjs';

const chromium = await loadChromium();

const HERE = fileURLToPath(new URL('.', import.meta.url));

/**
 * The shipped content-script engine, from the same bundler `build.mjs` uses, plus the resolver
 * the runner calls. Measuring anything else would measure a different engine.
 */
function bundle() {
  return `${bundleContent(join(HERE, '..'))}
    const __resolver = createResolver({ lexicons: EPIMONI_PACKS, autocomplete: EPIMONI_AUTOCOMPLETE });`;
}

const RUNNER = (profileJson, entriesJson) =>
  `const profile = ${profileJson}; const entries = ${entriesJson};\n${RUNNER_BODY}`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(HERE, 'fixtures', req.url.split('?')[0].replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(req.url)] || 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const cv = JSON.parse(readFileSync(join(HERE, 'cv.fixture.json'), 'utf8'));
// The extras a form needs and the CV does not hold: see SAMPLE_EXTRAS in ./scoring.js.
const profile = toProfile(cv, SAMPLE_EXTRAS);

const entries = toEntries(cv);

const FIXTURES = fixtureList(join(HERE, 'fixtures'));
const browser = await chromium.launch();
const page = await browser.newPage();
const engine = bundle();
const totals = { hit: 0, wrong: 0, miss: 0, soft: 0, ok: 0, ai: 0, aiMiss: 0, nodata: 0, stateFail: 0 };
const failures = [];

for (const fixture of FIXTURES) {
  await page.goto(`${base}/${fixture}`, { waitUntil: 'load' });
  const rows = [];
  for (const frame of page.frames()) {
    rows.push(
      ...(await frame.evaluate(
        `(() => { ${engine} ${RUNNER(JSON.stringify(profile), JSON.stringify(entries))} })()`,
      )),
    );
  }
  const tally = { hit: 0, wrong: 0, miss: 0, soft: 0, ok: 0, ai: 0, aiMiss: 0, nodata: 0 };
  for (const r of rows) {
    const verdict = verdictOf(r);
    // DUMP=1 prints every value written, for checking *what* went in and not only where.
    if (process.env.DUMP && r.wroteKey)
      console.log(`  ${fixture} ${r.wroteKey} = ${JSON.stringify(r.wroteValue)}`);
    tally[verdict] += 1;
    totals[verdict] += 1;
    if (r.stateOk === false) totals.stateFail += 1;
    if (verdict === 'wrong' || verdict === 'miss' || (process.env.VERBOSE && verdict === 'soft')) {
      failures.push({
        fixture,
        verdict,
        expect: r.expect,
        got: r.wroteKey,
        action: r.action,
        reason: r.reason,
        label: r.label,
        stateOk: r.stateOk,
        key: r.key,
      });
    }
  }
  const fillable = tally.hit + tally.wrong + tally.miss + tally.soft;
  const pct = fillable ? Math.round((tally.hit / fillable) * 100) : 100;
  console.log(
    `${fixture.padEnd(36)} fill ${String(pct).padStart(3)}%  hit ${tally.hit}  miss ${tally.miss}  soft ${tally.soft}  ai ${tally.ai}/${tally.ai + tally.aiMiss}  untouched-ok ${tally.ok}  no-data ${tally.nodata}  WRONG ${tally.wrong}`,
  );
}

const fillable = totals.hit + totals.wrong + totals.miss + totals.soft;
console.log(`\n${'─'.repeat(78)}`);
console.log(
  `fill rate        ${Math.round((totals.hit / fillable) * 100)}%  (${totals.hit}/${fillable} annotated fillable fields)`,
);
console.log(`wrong fills      ${totals.wrong}   ← Phase 0 gate requires 0`);
console.log(`controlled-state failures ${totals.stateFail}   ← native-setter path`);
console.log(
  `ai-candidates    ${totals.ai}/${totals.ai + totals.aiMiss} prose fields correctly routed to the phase-4 tier`,
);
console.log(`left alone       ${totals.ok} fields the ground truth says must not be touched`);
console.log(
  `resolved, no data ${totals.nodata} fields named correctly with nothing in the CV to put there (the AI tier's job)`,
);
if (failures.length) {
  console.log('\nfields not filled:');
  for (const f of failures)
    console.log(
      `  [${f.verdict.toUpperCase().padEnd(5)}] ${f.fixture.padEnd(20)} expect=${String(f.expect).padEnd(20)} got=${String(f.got ?? f.key).padEnd(16)} action=${f.action} ${f.reason ? `(${f.reason})` : ''} label="${f.label.slice(0, 44)}"`,
    );
}
await browser.close();
server.close();
process.exit(totals.wrong === 0 ? 0 : 1);
