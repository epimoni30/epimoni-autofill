// SPDX-License-Identifier: Apache-2.0
// The guarded API: the only way a filler touches the page.
//
// A filler for a custom dropdown has to click, open the list, pick an option, and a click
// is exactly how a form gets submitted by accident, or a consent box ticked, or the user sent
// to another page. So a filler never clicks anything itself (the bundler rejects `.click(` in
// filler code); it asks this API, which says no to every target that could do one of those
// things, and says no quietly: a refused action is a miss, and a miss costs one keystroke.
//
// Each API is bound to one control (the one the filler was asked to write) and may only act
// on that control, on elements inside it, or inside the popup it declares it owns
// (`aria-controls` / `aria-owns`). A filler for the degree dropdown cannot reach the
// "Envoyer ma candidature" button three sections down, whatever its code says.

const CLICK_BUDGET = 6; // per write: open, maybe scroll a list, choose. Never a loop.
const WAIT_CAP_MS = 2000;

/** Elements a click must never reach, whatever the filler believes they are. */
function dangerous(target) {
  const el = target.closest('button, input, a[href], [role="checkbox"], [role="switch"], label');
  if (!el) return null;
  if (el.matches('a[href]')) return 'a link navigates';
  if (el.matches('[role="checkbox"], [role="switch"]')) return 'checkboxes are never touched';
  if (el.tagName === 'LABEL') {
    const control = el.control;
    if (control && /^(checkbox|radio|file|submit)$/i.test(control.type || ''))
      return 'the label toggles a checkbox';
  }
  if (el.tagName === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (/^(submit|reset|image|checkbox|radio|file|password)$/.test(type)) return `an input of type ${type}`;
  }
  if (el.tagName === 'BUTTON') {
    // A <button> with no type inside a form is a submit button: the HTML default.
    const type = (el.getAttribute('type') || (el.form ? 'submit' : 'button')).toLowerCase();
    if (type !== 'button') return `a ${type} button`;
  }
  return null;
}

/** The popups a control declares: `aria-controls` and `aria-owns`, resolved in its own root. */
function popupsOf(control) {
  const root = control.getRootNode();
  const doc = control.ownerDocument;
  const ids = `${control.getAttribute('aria-controls') || ''} ${control.getAttribute('aria-owns') || ''}`
    .split(/\s+/)
    .filter(Boolean);
  // A combobox often carries the attribute on its inner input rather than on itself.
  for (const inner of control.querySelectorAll('[aria-controls], [aria-owns]'))
    ids.push(
      ...`${inner.getAttribute('aria-controls') || ''} ${inner.getAttribute('aria-owns') || ''}`
        .split(/\s+/)
        .filter(Boolean),
    );
  return ids.map((id) => root.getElementById?.(id) || doc.getElementById(id)).filter(Boolean);
}

/**
 * The API a filler's `write(el, value, api)` receives, bound to `control`.
 *
 * Every method returns false (or null) instead of acting when the target is out of bounds or
 * dangerous, and `refusals` records why, for the developer console and the tests.
 */
export function createGuard(control, { setValue, clearValue, matchOption }) {
  let clicks = 0;
  const refusals = [];
  const within = (target) =>
    target === control || control.contains(target) || popupsOf(control).some((p) => p.contains(target));
  const refuse = (why, target) => {
    refusals.push(`${why}: <${target?.tagName?.toLowerCase?.() || '?'}>`);
    return false;
  };
  const check = (target) => {
    if (target?.nodeType !== 1) return refuse('not an element', target);
    if (!within(target)) return refuse('outside the control and its popup', target);
    const why = dangerous(target);
    if (why) return refuse(why, target);
    return true;
  };
  const press = (target) => {
    if (!check(target)) return false;
    if (clicks >= CLICK_BUDGET) return refuse('click budget spent', target);
    clicks += 1;
    // The sequence a pointer produces. Widgets differ in which one they listen to (many React
    // dropdowns open on mousedown and pick on click) so all of them are sent, in order.
    const opts = { bubbles: true, cancelable: true, composed: true, view: target.ownerDocument.defaultView };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup'])
      target.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, opts));
    target.click();
    return true;
  };

  return {
    /** The popups this control declares, for a filler to look for its options in. */
    popups: () => popupsOf(control),
    /** Open the widget: a click on the control or something inside it. */
    open: (target = control) => press(target),
    /** Pick an option. It must be inside the control or the popup the control declares. */
    choose: (option) => press(option),
    /** Write text into an input inside the widget: the native setter, then `input`. Never a key. */
    type: (input, text) => (check(input) && input.matches('input, textarea') ? setValue(input, text) : false),
    /** Write a native control: the core's own path, including its React handling. */
    setValue: (target, value) => (check(target) ? setValue(target, value) : false),
    /** Clear a native control, for an `undo`. */
    clear: (target) => {
      if (!check(target)) return false;
      clearValue(target);
      return true;
    },
    /**
     * Which of these option labels a value picks, by the core's own rule (exact, then a prefix
     * of three characters or more), or -1. A filler never decides "close enough" itself.
     */
    pick: (texts, value) => {
      const list = (texts || []).map((t, i) => ({ text: String(t), value: String(i) }));
      const hit = matchOption(list, value);
      return hit ? Number(hit.value) : -1;
    },
    /** Wait for a condition the widget will satisfy after opening, at most two seconds. */
    waitFor: async (predicate, ms = 800) => {
      const until = Date.now() + Math.min(ms, WAIT_CAP_MS);
      for (;;) {
        const got = predicate();
        if (got) return got;
        if (Date.now() > until) return null;
        await new Promise((r) => setTimeout(r, 25));
      }
    },
    refusals,
  };
}
