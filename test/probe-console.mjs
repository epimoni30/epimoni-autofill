// The console probe (tools/probe-console.mjs) is pasted into people's own signed-in pages, so
// the one thing it must never do is write. This loads fixture pages, runs it, and fails if any
// field's value, checked state or selection changed, or if it read nothing.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium } from '../tools/chromium.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const code = readFileSync(join(ROOT, 'dist', 'probe-console.js'), 'utf8');
const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage();
const fails = [];
for (const f of ['parcours.html', 'ats-taleez.html', 'radios.html', 'traps.html']) {
  const html = readFileSync(join(ROOT, 'test', 'fixtures', f), 'utf8').replace(
    /<script src="_react.js"><\/script>.*$/s,
    '',
  );
  await page.setContent(html);
  const snap = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('input, textarea, select')]
        .map((e) => (e.type === 'radio' || e.type === 'checkbox' ? e.checked : e.value))
        .join('|'),
    );
  const before = await snap();
  await page.evaluate(code);
  const rows = await page.evaluate(() => window.__epimoniProbe || []);
  const unchanged = before === (await snap());
  const named = rows.filter((r) => r.key).length;
  console.log(
    `${unchanged && named ? '  ok  ' : ' FAIL '} ${f}: ${rows.length} fields read, ${named} named, nothing written: ${unchanged}`,
  );
  if (!unchanged || !named) fails.push(f);
}
await browser.close();
if (fails.length) {
  console.log(`\nFAILED: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('\nthe console probe reads and writes nothing');
