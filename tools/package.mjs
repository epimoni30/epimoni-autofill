// SPDX-License-Identifier: Apache-2.0
// The zip the Chrome Web Store takes, built locally: `npm run package`.
//
// The release workflow does the same on a tag; this is for a manual upload, and it refuses
// the one mistake that is easy to make by hand: zipping the *dev* build `npm run check`
// leaves in dist/, which grants localhost and auto-runs on a URL parameter.

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const run = (cmd, args, cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

run(process.execPath, ['build.mjs']);

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

const name = `epimoni-autofill-v${manifest.version}.zip`;
rmSync(join(ROOT, name), { force: true });
run('zip', ['-qr', join(ROOT, name), '.'], DIST);
console.log(`${name}: production build, ready for the Chrome Web Store dashboard`);
