// SPDX-License-Identifier: Apache-2.0
// The zip a store takes, built locally: `npm run package` for the Chrome Web Store (and Edge
// Add-ons, same package), `npm run package:firefox` for addons.mozilla.org.
//
// The release workflow does the same on a tag; this is for a manual upload, and it refuses
// the one mistake that is easy to make by hand: zipping the *dev* build `npm run check`
// leaves in dist/, which grants localhost and auto-runs on a URL parameter.

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { targetFrom } from '../platform/index.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGET = targetFrom(process.argv);
const DIST = join(ROOT, TARGET.dist);
const run = (cmd, args, cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

run(process.execPath, ['build.mjs', `--target=${TARGET.id}`]);

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
const problems = [];
if (/127\.0\.0\.1|localhost/.test(JSON.stringify(manifest))) problems.push('manifest grants localhost');
if (!readFileSync(join(DIST, 'content.js'), 'utf8').includes('const EPIMONI_DEV = false'))
  problems.push('content.js is a dev build');
if (!readFileSync(join(DIST, 'background.js'), 'utf8').includes('globalThis.EPIMONI_DEV = false'))
  problems.push('background.js is a dev build');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
if (pkg.version !== manifest.version)
  problems.push(`package.json ${pkg.version} and manifest.json ${manifest.version} disagree`);
if (problems.length) {
  console.error(`refusing to package:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}

// Chrome keeps the unsuffixed name the release workflow and the store dashboard already use.
const suffix = TARGET.id === 'chrome' ? '' : `-${TARGET.id}`;
const name = `epimoni-autofill-v${manifest.version}${suffix}.zip`;
rmSync(join(ROOT, name), { force: true });
run('zip', ['-qr', join(ROOT, name), '.'], DIST);
console.log(`${name}: production ${TARGET.id} build, ready for its store`);
