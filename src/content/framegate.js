// SPDX-License-Identifier: Apache-2.0
// Whether a form inside a frame is on screen for a person, before we write a CV into it.
//
// Inside a frame, every check we make on a control looks only at the frame's own document.
// The page around the frame is out of reach: it can fade the frame to `opacity: 0`, shrink it
// to a pixel, or lay its own content over it, and from inside, the form still looks perfectly
// ordinary. A filled form in such a frame is read by the frame's script, which belongs to
// whoever put it there (an ad, a widget), with the user never having seen the question. The
// same shape is why browsers are careful about autofill in frames.
//
// So in a frame we fill only once the browser itself says a control is seen:
//
//   - Chromium's IntersectionObserver v2 (`trackVisibility`) reports `isVisible` only for a
//     target with no opacity, filter or transform on it or on any ancestor, frames included,
//     and nothing painted over it. It is the browser's own occlusion check, which is exactly
//     what a frame cannot compute for itself. An embedded form below the fold is not refused:
//     the wait lasts until the user scrolls to it, or `ms` runs out.
//   - Without v2 (Firefox), a frame fills only when every frame above it is the same origin,
//     so we can walk up and check each frame element as we check a control. A frame inside a
//     page of another origin cannot be checked there, and is left alone.
//
// A top-level document has no page around it and is not held to any of this.

import { concealed } from './dom.js';

const visibilityV2 =
  typeof IntersectionObserverEntry !== 'undefined' && 'isVisible' in IntersectionObserverEntry.prototype;

// Smaller than this, a frame is not showing a form to anybody.
const MIN_W = 120;
const MIN_H = 60;

/** Every frame element above `win`, nearest first, or null when one of them is out of reach. */
function frameChain(win) {
  const chain = [];
  let w = win;
  while (w !== w.top) {
    let el = null;
    try {
      el = w.frameElement;
    } catch {}
    if (!el) return null;
    chain.push(el);
    w = w.parent;
  }
  return chain;
}

function shownWithoutV2(win) {
  const chain = frameChain(win);
  if (!chain) return false;
  return chain.every((el) => {
    const r = el.getBoundingClientRect();
    return r.width >= MIN_W && r.height >= MIN_H && !concealed(el);
  });
}

/**
 * Resolves true when this document may be filled: at once at the top level, and in a frame
 * once one of `controls` is seen whole on screen. Resolves false after `ms` without that, or
 * at once when it can never be known here.
 */
export function frameShown(controls, ms, win = window) {
  if (win === win.top) return Promise.resolve(true);
  if (win.innerWidth < MIN_W || win.innerHeight < MIN_H) return Promise.resolve(false);
  if (!visibilityV2) return Promise.resolve(shownWithoutV2(win));
  const targets = controls.slice(0, 50);
  if (!targets.length) return Promise.resolve(false);
  return new Promise((done) => {
    let timer = null;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isVisible && e.intersectionRatio >= 0.5)) return;
        finish(true);
      },
      { trackVisibility: true, delay: 100, threshold: [0, 0.5, 1] },
    );
    function finish(ok) {
      io.disconnect();
      clearTimeout(timer);
      done(ok);
    }
    for (const el of targets) io.observe(el);
    timer = setTimeout(() => finish(false), ms);
  });
}
