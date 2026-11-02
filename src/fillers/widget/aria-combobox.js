// SPDX-License-Identifier: Apache-2.0
// Widget filler: the WAI-ARIA combobox: a control with role="combobox" that opens a
// role="listbox" of role="option" elements (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).
//
// Why it exists: custom dropdowns are not <select>s, so the native scan sees either nothing
// (a <div> that opens a list) or a free-text input (a typeahead), and a degree or a country
// asked that way was never filled. React-Select, MUI Autocomplete, Headless UI and most ATS
// design systems follow this pattern closely enough to share one filler.
//
// What it does NOT decide: which question the combobox asks (the core reads its label like
// any other control's) or which answer to give (the core formats the value; `api.pick`
// matches it against the options by the core's own rule). It only operates the widget.

import { byIdAnywhere, deepQueryAll, normalize } from '../../content/dom.js';

// Options that are prompts rather than answers: "Select One", "Choisir…", ": ".
const PROMPT = /^(select|choose|choisi|selectionn|seleccion|elige|pick|--|—|-)/;
const isPrompt = (text) => !normalize(text) || PROMPT.test(normalize(text) || text.trim());

// An e-mail, phone or web address field marked up as a combobox (it suggests "@gmail.com" as you
// type) is not a list to pick from: its answer is what is typed. It stays the core's, which
// writes it like any other input.
const FREE_TEXT = 'input[type="email"], input[type="tel"], input[type="url"]';

const isCombobox = (el) =>
  el.getAttribute('role') === 'combobox' &&
  !el.matches(FREE_TEXT) &&
  Boolean(
    el.getAttribute('aria-controls') || el.getAttribute('aria-owns') || el.getAttribute('aria-haspopup'),
  );

/**
 * An option's label. Usually its text; in a web component the label is often slotted in from
 * outside, so the option's own text is empty and the slot's assigned content is what shows.
 */
export const optionText = (o) => {
  const own = (o.textContent || '').trim();
  if (own) return own;
  return [...o.querySelectorAll('slot')]
    .map((s) =>
      s
        .assignedNodes({ flatten: true })
        .map((n) => n.textContent || '')
        .join(''),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/** Options currently rendered in the popups this control declares, prompts left out. */
function renderedOptions(api) {
  return api
    .popups()
    .flatMap((p) => deepQueryAll(p, '[role="option"]'))
    .filter((o) => o.getAttribute('aria-disabled') !== 'true' && !isPrompt(optionText(o)));
}

export default {
  id: 'aria-combobox',
  kind: 'widget',
  match: { widget: isCombobox },

  /** A combobox built from a <div> or a <button> is not a native control; find it. */
  controls: (root) => deepQueryAll(root, '[role="combobox"]').filter(isCombobox),

  /**
   * A combobox is always a closed list. Its answers are listed here when they are already in
   * the page, and otherwise only exist once it is opened (`true`).
   */
  options(el) {
    const root = el.getRootNode();
    // Either attribute may be missing, and the join leaves an empty id that is not a popup.
    const ids = `${el.getAttribute('aria-controls') || ''} ${el.getAttribute('aria-owns') || ''}`
      .split(/\s+/)
      .filter(Boolean);
    const popup = ids
      .map((id) => root.getElementById?.(id) || el.ownerDocument.getElementById(id) || byIdAnywhere(el, id))
      .find(Boolean);
    const texts = popup
      ? [...popup.querySelectorAll('[role="option"]')].map(optionText).filter((t) => !isPrompt(t))
      : [];
    return texts.length ? texts : true;
  },

  /** Answered when an option other than the prompt is already selected, or the input has text. */
  answered(el) {
    if (el.matches('input')) return Boolean(el.value.trim());
    const root = el.getRootNode();
    // Either attribute may be missing, and the join leaves an empty id that is not a popup.
    const ids = `${el.getAttribute('aria-controls') || ''} ${el.getAttribute('aria-owns') || ''}`
      .split(/\s+/)
      .filter(Boolean);
    return ids.some((id) => {
      const popup = root.getElementById?.(id) || el.ownerDocument.getElementById(id) || byIdAnywhere(el, id);
      const selected = popup?.querySelector('[role="option"][aria-selected="true"]');
      return Boolean(selected && !isPrompt(optionText(selected)));
    });
  },

  async write(el, value, api) {
    const expanded = () => el.getAttribute('aria-expanded') === 'true';
    // A typeahead filters as you type; typing the value first keeps a long list short. What it
    // held before is put back if nothing is picked: a miss leaves no half-typed query behind.
    const before = el.matches('input') ? el.value : null;
    const miss = () => {
      if (before !== null && el.value !== before) api.type(el, before);
      if (expanded()) api.open(el); // close it again rather than leave it hanging open
      return false;
    };
    if (el.matches('input')) api.type(el, value);
    if (!expanded() && !api.open(el)) return miss();
    const texts = (found) => found.map(optionText);
    // A typeahead's answers come from a server: the first list shown can be the previous
    // query's, or "No results" while the request is in flight. So it waits, up to the guard's
    // cap, for a list holding a match; a list already in the page needs no such wait.
    const typeahead = el.matches('input');
    const options = await api.waitFor(
      () => {
        const found = renderedOptions(api);
        if (!found.length) return null;
        return !typeahead || api.pick(texts(found), value) !== -1 ? found : null;
      },
      typeahead ? 2000 : 800,
    );
    const shown = options || renderedOptions(api);
    if (!shown.length) return miss();
    const i = api.pick(texts(shown), value);
    if (i === -1) return miss();
    if (!api.choose(shown[i])) return false;
    return {
      ok: true,
      // Undo picks the prompt option back when the list has one. A combobox with no prompt
      // cannot be emptied from outside, and the panel's undo then leaves it as it is.
      undo: async () => {
        if (!expanded()) api.open(el);
        const prompt = await api.waitFor(() =>
          api
            .popups()
            .flatMap((p) => [...p.querySelectorAll('[role="option"]')])
            .find((o) => isPrompt(optionText(o))),
        );
        if (prompt) api.choose(prompt);
        else if (expanded()) api.open(el);
      },
    };
  },
};
