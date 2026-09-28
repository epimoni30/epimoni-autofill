// SPDX-License-Identifier: Apache-2.0
// The Chrome Web Store screenshots, rendered from the built extension rather than mocked.
//
// The store takes 1280×800 (or 640×400) PNGs. Drawing them by hand would mean a picture of a
// product that no longer exists after the next UI change; this drives the same path e2e does,
// a dev build, a seeded CV, executeScript + a `fill` message, and captures what a user sees.
//
//   node build.mjs --dev && node tools/screenshots.mjs [--lang=fr|en]
//
// Output: store/screenshots/<lang>-<n>-<name>.png and store/promo-<lang>-440x280.png.
// `npm run store` does all of it for both languages and leaves a production dist/ behind.

import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadChromium } from './chromium.mjs';
import { toProfile } from '../src/shared/cvdoc.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const FIXTURES = join(ROOT, 'test', 'fixtures');
const OUT = join(ROOT, 'store', 'screenshots');
const LANG = (process.argv.find((a) => a.startsWith('--lang=')) || '--lang=fr').slice(7);
const SIZE = { width: 1280, height: 800 };

const built = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
if (!(built.host_permissions || []).some((h) => h.includes('127.0.0.1'))) {
  console.error('dist/ is not a dev build: run `node build.mjs --dev` first.');
  process.exit(1);
}

const extId = [...createHash('sha256').update(DIST).digest('hex').slice(0, 32)]
  .map((c) => 'abcdefghijklmnop'[parseInt(c, 16)])
  .join('');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};
const server = createServer(async (req, res) => {
  try {
    // store/ holds the styled pages the listing shows (and icons/ the tile's mark); everything
    // else is a test fixture.
    const path = req.url.split('?')[0].replace(/^\//, '');
    const body = await readFile(/^(store|icons)\//.test(path) ? join(ROOT, path) : join(FIXTURES, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const chromium = await loadChromium();

// The extension's own UI follows the browser's UI language. `--lang` sets it on Linux and
// Windows; macOS ignores it and reads AppleLanguages, which Playwright will not pass as an
// argument. So on macOS it is set for the Chromium bundle only, and put back on exit.
// The bundle is read from the browser Playwright will launch, Chromium or Chrome for Testing,
// depending on the Playwright version, rather than guessed.
const app = chromium.executablePath().match(/^(.*?\.app)\//)?.[1];
const BUNDLE = app
  ? execFileSync('defaults', ['read', `${app}/Contents/Info`, 'CFBundleIdentifier'])
      .toString()
      .trim()
  : null;
let restoreLocale = () => {};
if (process.platform === 'darwin' && BUNDLE) {
  // Only this one key is touched, and it is put back exactly: `defaults import` would merge
  // rather than replace, and leave the key behind when it did not exist before.
  let before = null;
  try {
    before = execFileSync('defaults', ['read', BUNDLE, 'AppleLanguages'], { stdio: 'pipe' })
      .toString()
      .match(/"?([\w-]+)"?\s*[,)]/g)
      ?.map((m) => m.replace(/[",)\s]/g, ''));
  } catch {}
  execFileSync('defaults', ['write', BUNDLE, 'AppleLanguages', '-array', LANG]);
  restoreLocale = () => {
    if (before?.length) execFileSync('defaults', ['write', BUNDLE, 'AppleLanguages', '-array', ...before]);
    else execFileSync('defaults', ['delete', BUNDLE, 'AppleLanguages']);
  };
  process.on('exit', restoreLocale);
}

const ctx = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), 'epimoni-shots-')), {
  channel: 'chromium',
  viewport: SIZE,
  deviceScaleFactor: 1,
  locale: LANG,
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    `--lang=${LANG}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

const waker = await ctx.newPage();
await waker.goto(`chrome-extension://${extId}/popup.html`).catch(() => {});
let sw = null;
for (let i = 0; i < 40 && !sw; i += 1) {
  sw = ctx.serviceWorkers().find((w) => w.url().includes(extId)) || null;
  if (!sw) await waker.waitForTimeout(250);
}
await waker.close();
if (!sw) {
  console.error(`service worker never started for ${extId}`);
  process.exit(1);
}

// The same CV the e2e run uses, stored as a local, unpaired document: the screenshots show
// the product anyone can install, not an account feature.
const cv = JSON.parse(readFileSync(join(ROOT, 'test', 'cv.fixture.json'), 'utf8'));
const profile = toProfile(cv, { postal_code: '44000', country: 'France' });
await sw.evaluate(
  async ({ cv, profile }) => {
    await chrome.storage.local.set({
      epimoni: {
        paired: false,
        extras: {},
        rejected: {},
        cvs: [
          {
            id: 'cv-demo',
            label: 'CV principal',
            source: 'local',
            cv,
            profile,
            taken_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        active_cv_id: 'cv-demo',
      },
    });
  },
  { cv, profile },
);

await mkdir(OUT, { recursive: true });
let n = 0;
const shoot = async (page, name) => {
  n += 1;
  const file = join(OUT, `${LANG}-${n}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(file);
};

const fill = async (file) => {
  const p = await ctx.newPage();
  await p.setViewportSize(SIZE);
  await p.goto(`${base}/${file}`, { waitUntil: 'load' });
  const id = await sw.evaluate(
    async (f) => (await chrome.tabs.query({})).find((t) => t.url?.includes(f))?.id ?? null,
    file,
  );
  await sw.evaluate(async (tab) => {
    await chrome.scripting.executeScript({ target: { tabId: tab, allFrames: true }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab, { type: 'fill' });
  }, id);
  await p.waitForFunction(() => document.getElementById('epimoni-panel'), { timeout: 5000 });
  await p.waitForTimeout(800); // the panel fades its buttons in
  return p;
};

await shoot(await fill(`store/demo.html?lang=${LANG}`), 'fill');

const editor = await ctx.newPage();
await editor.setViewportSize(SIZE);
await editor.goto(`chrome-extension://${extId}/dashboard.html`, { waitUntil: 'load' });
await editor.waitForTimeout(500);
await shoot(editor, 'cv-editor');

const tile = await ctx.newPage();
await tile.setViewportSize({ width: 440, height: 280 });
await tile.goto(`${base}/store/promo.html?lang=${LANG}`, { waitUntil: 'load' });
const tileFile = join(ROOT, 'store', `promo-${LANG}-440x280.png`);
await tile.screenshot({ path: tileFile });
console.log(tileFile);

await ctx.close();
server.close();
