// Where Playwright's Chromium comes from, decided in one place.
//
// This used to be an absolute path to one laptop, repeated in six files, which meant
// `npm run check` could only ever pass on that laptop. The lookup order now is:
//
//   1. this project's own node_modules: what `npm install` gives a fresh clone
//   2. a sibling `playwright/` project: the monorepo layout, where one browser download
//                                          is shared by every sub-project rather than each
//                                          installing its own stack
//
// Both package names export the same `chromium`; `@playwright/test` is tried first only
// because that is the one the sibling project installs.
//
// Resolution is deliberately lazy: importing this module costs nothing, so a unit test that
// never opens a browser does not need Playwright present at all.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..', '..'); // extension/tools -> extension -> monorepo root

const PACKAGES = ['@playwright/test', 'playwright'];

async function chromiumFrom(specifier) {
  try {
    const mod = await import(specifier);
    return mod?.chromium ?? null;
  } catch {
    return null; // not installed here; try the next location
  }
}

/**
 * Resolve Playwright's `chromium` launcher, or throw with the two ways to fix it.
 * @returns {Promise<import('playwright').BrowserType>}
 */
export async function loadChromium() {
  for (const pkg of PACKAGES) {
    const chromium = await chromiumFrom(pkg);
    if (chromium) return chromium;
  }

  for (const pkg of PACKAGES) {
    const entry = join(REPO, 'playwright', 'node_modules', pkg, 'index.mjs');
    if (!existsSync(entry)) continue;
    const chromium = await chromiumFrom(pathToFileURL(entry).href);
    if (chromium) return chromium;
  }

  throw new Error(
    'Playwright not found. Either `npm install` in extension/, or check out the monorepo ' +
      `layout with a sibling playwright/ project (looked in ${join(REPO, 'playwright')}).`,
  );
}
