// SPDX-License-Identifier: Apache-2.0
// A form in a frame is filled only when the frame is on screen. Node has no
// IntersectionObserver v2, so this is the path a browser without it takes (Firefox): walk up
// the frames and check each one, and refuse when one of them is out of reach.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameShown } from '../src/content/framegate.js';

const style = { clip: 'auto', clipPath: 'none' };
const view = { scrollX: 0, scrollY: 0, getComputedStyle: () => style };
// A frame element, as its parent document sees it.
const frameEl = ({ w = 600, h = 400, x = 0, y = 0, shown = true } = {}) => ({
  ownerDocument: { defaultView: view },
  checkVisibility: () => shown,
  getBoundingClientRect: () => ({ width: w, height: h, right: x + w, bottom: y + h }),
});
const top = { innerWidth: 1200, innerHeight: 800 };
top.top = top;
const frame = (parent, el, { w = 600, h = 400 } = {}) => ({
  top: parent.top,
  parent,
  innerWidth: w,
  innerHeight: h,
  get frameElement() {
    if (el === 'cross-origin') throw new DOMException('Blocked a frame', 'SecurityError');
    return el;
  },
});

test('a top-level page is never held back', async () => {
  assert.equal(await frameShown([], 10, top), true);
});

test('a frame shown in a page of its own origin fills', async () => {
  assert.equal(await frameShown([], 10, frame(top, frameEl())), true);
});

test('a frame its page hid, shrank or pushed off screen does not', async () => {
  assert.equal(await frameShown([], 10, frame(top, frameEl({ shown: false }))), false);
  assert.equal(await frameShown([], 10, frame(top, frameEl({ w: 1, h: 1 }))), false);
  assert.equal(await frameShown([], 10, frame(top, frameEl({ x: -5000 }))), false);
  assert.equal(await frameShown([], 10, frame(top, frameEl(), { w: 1, h: 1 })), false);
});

test('a frame inside a page of another origin cannot be checked, and is left alone', async () => {
  assert.equal(await frameShown([], 10, frame(top, 'cross-origin')), false);
  assert.equal(await frameShown([], 10, frame(top, null)), false);
  // Two levels down: a hidden outer frame hides everything inside it.
  const outer = frame(top, frameEl({ shown: false }));
  assert.equal(await frameShown([], 10, frame(outer, frameEl())), false);
  const fine = frame(top, frameEl());
  assert.equal(await frameShown([], 10, frame(fine, frameEl())), true);
});
