// Per-browser manifests (platform/). The transform is the only thing that differs between the
// Chrome and Firefox builds, so it is asserted against the real manifest.json, and each
// target's validator is held to refusing what that browser refuses at load time.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TARGETS } from '../platform/index.mjs';
import { GECKO_ID } from '../platform/firefox.mjs';

const source = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const { chrome, firefox } = TARGETS;

test('the Chrome target is the source manifest, and valid', () => {
  assert.deepEqual(chrome.transform(source), source);
  assert.deepEqual(chrome.validate(chrome.transform(source)), []);
});

test('the Firefox manifest has what Firefox loads, and passes its own rules', () => {
  const m = firefox.transform(source);
  assert.deepEqual(firefox.validate(m), []);
  assert.deepEqual(m.background, { scripts: ['background.js'], type: 'module' });
  assert.equal(m.externally_connectable, undefined);
  assert.equal(m.minimum_chrome_version, undefined);
  assert.equal(m.browser_specific_settings.gecko.id, GECKO_ID);
  assert.ok(m.browser_specific_settings.gecko.data_collection_permissions);
  for (const cs of m.content_scripts) assert.equal('match_origin_as_fallback' in cs, false);
  // The frames Chrome reaches with match_origin_as_fallback are still reached, the Firefox way.
  const boards = m.content_scripts.find((cs) => cs.matches.includes('https://*.hellowork.com/*'));
  assert.equal(boards.match_about_blank, true);
});

test('the transform leaves the source manifest untouched', () => {
  const before = JSON.stringify(source);
  firefox.transform(source);
  assert.equal(JSON.stringify(source), before);
});

test('the Firefox validator refuses what Firefox refuses', () => {
  assert.ok(firefox.validate(source).length >= 3, 'the Chrome manifest is not a Firefox manifest');
});

test('every target carries the site bridge, the only pairing path Firefox has', () => {
  for (const target of Object.values(TARGETS)) {
    const bridge = target
      .transform(source)
      .content_scripts.find((cs) => cs.js.includes('src/epimoni/bridge.js'));
    assert.ok(bridge, `${target.id} has no bridge`);
    assert.deepEqual(bridge.matches, ['https://www.epimoni30.com/*']);
    // Top frame only: a frame the site embeds is somebody else's page.
    assert.notEqual(bridge.all_frames, true);
  }
});
