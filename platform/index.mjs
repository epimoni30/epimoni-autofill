// SPDX-License-Identifier: Apache-2.0
// The browsers the extension builds for. A new one is a file next to this one: a manifest
// transform, a dist directory and the load-time rules worth checking at build time.

import chrome from './chrome.mjs';
import firefox from './firefox.mjs';

export const TARGETS = { chrome, firefox };

/** `--target=<id>` from argv, Chrome when absent. Exits on an unknown id. */
export function targetFrom(argv) {
  const arg = argv.find((a) => a.startsWith('--target='));
  const id = arg ? arg.slice('--target='.length) : 'chrome';
  const target = TARGETS[id];
  if (!target) {
    console.error(`unknown --target=${id}; known: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }
  return target;
}
