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

import { deepQueryAll, normalize } from '../../content/dom.js';

// Options that are prompts rather than answers: "Select One", "Choisir…", ": ".
const PROMPT = /^(select|choose|choisi|selectionn|seleccion|elige|pick|--|—|-)/;
const isPrompt = (text) => !normalize(text) || PROMPT.test(normalize(text) || text.trim());

const isCombobox = (el) =>
  el.getAttribute('role') === 'combobox' &&
  Boolean(
    el.getAttribute('aria-controls') || el.getAttribute('aria-owns') || el.getAttribute('aria-haspopup'),
  );

/** Options currently rendered in the popups this control declares, prompts left out. */
function renderedOptions(api) {
  return api
    .popups()
    .flatMap((p) => [...p.querySelectorAll('[role="option"]')])
    .filter((o) => o.getAttribute('aria-disabled') !== 'true' && !isPrompt(o.textContent));
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
    const ids = `${el.getAttribute('aria-controls') || ''} ${el.getAttribute('aria-owns') || ''}`.split(
      /\s+/,
    );
    const popup = ids
      .map((id) => id && (root.getElementById?.(id) || el.ownerDocument.getElementById(id)))
      .find(Boolean);
    const texts = popup
      ? [...popup.querySelectorAll('[role="option"]')]
          .map((o) => o.textContent.trim())
          .filter((t) => !isPrompt(t))
      : [];
    return texts.length ? texts : true;
  },

  /** Answered when an option other than the prompt is already selected, or the input has text. */
  answered(el) {
    if (el.matches('input')) return Boolean(el.value.trim());
    const root = el.getRootNode();
    const ids = `${el.getAttribute('aria-controls') || ''} ${el.getAttribute('aria-owns') || ''}`.split(
      /\s+/,
    );
    return ids.some((id) => {
      const popup = id && (root.getElementById?.(id) || el.ownerDocument.getElementById(id));
      const selected = popup?.querySelector('[role="option"][aria-selected="true"]');
      return Boolean(selected && !isPrompt(selected.textContent));
    });
  },

  async write(el, value, api) {
    const expanded = () => el.getAttribute('aria-expanded') === 'true';
    // A typeahead filters as you type; typing the value first keeps a long list short.
    if (el.matches('input')) api.type(el, value);
    if (!expanded() && !api.open(el)) return false;
    const options = await api.waitFor(() => {
      const found = renderedOptions(api);
      return found.length ? found : null;
    });
    if (!options) return false;
    const i = api.pick(
      options.map((o) => o.textContent.trim()),
      value,
    );
    if (i === -1) {
      if (expanded()) api.open(el); // close it again rather than leave it hanging open
      return false;
    }
    if (!api.choose(options[i])) return false;
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
            .find((o) => isPrompt(o.textContent)),
        );
        if (prompt) api.choose(prompt);
        else if (expanded()) api.open(el);
      },
    };
  },
};
