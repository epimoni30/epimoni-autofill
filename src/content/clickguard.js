// SPDX-License-Identifier: Apache-2.0
// Clickjacking guard for the buttons the extension draws inside a web page.
//
// `isTrusted` proves a person clicked. It does not prove they saw what they clicked. Our panel
// and the "Remplir avec Epimoni" tab live in the page's DOM, so the page can fade our host to
// `opacity: 0`, slide it under a fake "Accept cookies" button, or lay a `pointer-events: none`
// overlay on top of it, and a real click then fills a CV into a form the person never chose.
// That is the DOM-based extension clickjacking attack shown against password managers at
// DEF CON 33 (Marek Tóth, 2025). An autofill extension carries the same risk, with a CV in
// place of a password.
//
// So a click on one of our buttons counts only when all of these hold at that moment:
//
//   1. it is trusted (the page's script cannot call `.click()` on it);
//   2. the UI has been on screen, unobstructed, for DWELL_MS: a button that pops up under the
//      cursor a moment before an expected click cannot be pressed by that click;
//   3. Chromium's IntersectionObserver v2 says the button is visible: no opacity, filter or
//      transform on it or any ancestor (frames included) and nothing painted over it. This is
//      the browser's own occlusion check, built for exactly this attack on ads in iframes;
//   4. and, because Firefox has no v2, our own checks: the host and the root element carry no
//      opacity, filter, clip, mask or blend; the click lands on our host and, inside our shadow
//      root, on the button; nothing in the top layer and no element after our host overlaps it.
//
// A refused click does nothing. When the reason is tampering, `onRefuse` lets the UI point the
// person at the toolbar icon, which no page can cover.
//
// The page can read and set our host's attributes; nothing here trusts them. `data-epimoni-armed`
// is written for the end-to-end suite, which has to know when a click will be taken.

export const DWELL_MS = 500;
export const ARMED_ATTR = 'data-epimoni-armed';

const visibilityV2 =
  typeof IntersectionObserverEntry !== 'undefined' && 'isVisible' in IntersectionObserverEntry.prototype;

/**
 * Watch `target` (an element inside `root`, the closed shadow root `host` carries) and answer
 * whether a click event on a button inside it should be taken.
 *
 * Returns `{ allow(event, button) -> '' | reason, stop() }`. Reasons: 'untrusted', 'early',
 * 'hidden', 'covered', 'detached'.
 */
export function clickGuard(host, root, target, { onRefuse } = {}) {
  let since = 0; // when the UI was last seen fully visible; 0 while it is not
  let timer = null;
  const now = () => performance.now();
  const arm = () => {
    clearTimeout(timer);
    host.removeAttribute(ARMED_ATTR);
    if (!since) return;
    timer = setTimeout(
      () => {
        if (since && host.isConnected) host.setAttribute(ARMED_ATTR, '');
      },
      Math.max(0, DWELL_MS - (now() - since)),
    );
  };

  let io = null;
  if (visibilityV2) {
    io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        if (e.isVisible) since = since || now();
        else since = 0;
        arm();
      },
      { trackVisibility: true, delay: 100, threshold: [1] },
    );
    io.observe(target);
  } else {
    since = now();
    arm();
  }

  function allow(event, button) {
    if (!event?.isTrusted) return 'untrusted';
    if (!host.isConnected) return 'detached';
    // Never seen whole: something covers it, and the person should hear why nothing happens.
    if (!since) return refuse('covered');
    if (now() - since < DWELL_MS) return 'early';
    if (tampered(host, button)) return refuse('hidden');
    if (covered(event, host, root, button)) return refuse('covered');
    return '';
  }
  function refuse(reason) {
    // The clock starts again: whatever hid the UI has to stop doing so for a full dwell.
    if (!visibilityV2) {
      since = now();
      arm();
    }
    try {
      onRefuse?.(reason);
    } catch {}
    return reason;
  }
  function stop() {
    io?.disconnect();
    clearTimeout(timer);
  }
  return { allow, stop };
}

/** Anything the page could have put on our host or the root element to hide what we draw. */
export function tampered(host, button) {
  if (
    typeof button?.checkVisibility === 'function' &&
    !button.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })
  )
    return true;
  // The host is a child of <html>, so these two are its only ancestors in this document.
  for (const n of [host, document.documentElement]) {
    const s = getComputedStyle(n);
    if (Number(s.opacity) < 1 || s.visibility !== 'visible' || s.display === 'none') return true;
    if (s.filter !== 'none' || (s.backdropFilter && s.backdropFilter !== 'none')) return true;
    if (n === host) {
      if (s.clipPath !== 'none' || (s.maskImage && s.maskImage !== 'none')) return true;
      if (s.mixBlendMode !== 'normal' || s.transform !== 'none') return true;
    }
  }
  return false;
}

/** Whether something else sits where the person clicked, or over the button at all. */
export function covered(event, host, root, button) {
  const r = button.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return true;
  // A keyboard or assistive-technology activation, or a `change` on a <select>, has no pointer
  // position: use the centre.
  const pointer =
    typeof event.clientX === 'number' && event.detail > 0 && !(event.clientX === 0 && event.clientY === 0);
  const x = pointer ? event.clientX : r.left + r.width / 2;
  const y = pointer ? event.clientY : r.top + r.height / 2;
  if (x < r.left - 1 || x > r.right + 1 || y < r.top - 1 || y > r.bottom + 1) return true;
  if (document.elementFromPoint(x, y) !== host) return true;
  const inner = root.elementFromPoint?.(x, y);
  if (inner && inner !== button && !button.contains(inner)) return true;
  // `elementFromPoint` skips `pointer-events: none`, which is how an overlay lets the click
  // through. Two places can still paint over a host with the maximum z-index: the top layer,
  // and elements placed after the host in <html>.
  const overlaps = (el) => {
    const o = el.getBoundingClientRect();
    return (
      o.width > 0 &&
      o.height > 0 &&
      o.left < r.right &&
      o.right > r.left &&
      o.top < r.bottom &&
      o.bottom > r.top
    );
  };
  // One selector at a time: a browser that does not know one of these throws on the list.
  for (const sel of [':popover-open', ':modal', ':fullscreen']) {
    let found = [];
    try {
      found = document.querySelectorAll(sel);
    } catch {}
    for (const el of found) if (el !== host && !el.contains(host) && overlaps(el)) return true;
  }
  for (let n = host.nextElementSibling; n; n = n.nextElementSibling) if (overlaps(n)) return true;
  return false;
}
