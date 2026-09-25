// Regenerate icons/*.png from the brand mark. `npm run icons`.
//
// The source is `logo/e30-violet-solid.svg` *in this repository*, which is a vendored copy of
// the canonical kit held outside it. Vendored rather than read across the monorepo, because a
// path reaching out of the repo is a script that cannot run for anyone who clones this one on
// its own. The two copies are byte-identical; if the kit's mark changes, re-copy it here.
//
// The mark is not covered by this repository's licence: see TRADEMARK.md.
//
// The *violet* E30 rather than the primary near-black one, and that is a deliberate trade.
// A toolbar icon is the one place the brand mark is drawn on a surface we do not control:
// `#09090b` on Chrome's dark toolbar (`#292a2d`) is a barely-visible square, and an icon the
// user cannot find is an extension they do not use. The wordmark is unchanged: only the
// plate colour moves, onto a violet the kit already carries.
//
// Rendered through Chromium rather than a rasteriser because the mark is *text* in Geist:
// the engine that draws the icon in the toolbar is the engine that measures the glyphs, and
// the Geist fallback chain (Geist → system-ui) resolves the same way here as it does there.
//
// Chromium is borrowed from the repo's root playwright install: the same trick measure.mjs
// uses, so this adds no second browser stack.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadChromium } from './chromium.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(ROOT, 'logo/e30-violet-solid.svg');
const SIZES = [16, 32, 48, 128];

const chromium = await loadChromium();

const svg = await readFile(SOURCE, 'utf8');
await mkdir(join(ROOT, 'icons'), { recursive: true });

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    // Render at 4× and let the screenshot downscale: Chromium's SVG text rasteriser at 16 px
    // hints the glyphs into a smudge, where a downscaled 64 px render keeps the counters open.
    const scale = size <= 48 ? 4 : 2;
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: scale,
    });
    await page.setContent(
      `<!doctype html><meta charset="utf-8">` +
        `<style>html,body{margin:0;padding:0;background:transparent}` +
        `svg{display:block;width:${size}px;height:${size}px}</style>` +
        svg,
      { waitUntil: 'load' },
    );
    // Without this the first paint can land before Geist is resolved, and the icon ships in
    // the system-ui fallback: visibly wider, and only on whichever machine ran the build.
    await page.evaluate(() => document.fonts.ready);
    const big = await page.screenshot({ omitBackground: true });
    await page.close();

    // Downscale the 4× shot to the real size. sips is macOS-only but so is this repo's
    // toolchain, and it is the only step that needs a pixel resampler.
    const tmp = join(ROOT, `icons/.${size}.tmp.png`);
    await writeFile(tmp, big);
    const { execFileSync } = await import('node:child_process');
    execFileSync('sips', ['-z', String(size), String(size), tmp, '--out', join(ROOT, `icons/${size}.png`)], {
      stdio: 'ignore',
    });
    execFileSync('rm', ['-f', tmp]);
    console.log(`icons/${size}.png  ← ${SOURCE.replace(ROOT, '')} @${scale}×`);
  }
} finally {
  await browser.close();
}
