// SPDX-License-Identifier: Apache-2.0
// Widget filler: Taleez's dropdown, `<tz-select>`.
//
// Taleez is one of the ATS French employers use most, and its application form asks the level
// of study, the years of experience and the expected salary through this widget. It is not a
// <select> and carries no ARIA role, so the core saw only its search box. Opening it renders
// the options into an Angular CDK overlay at the end of <body>, declared nowhere: the guard
// treats what this widget's own open click rendered as its popup (src/content/guard.js).
//
// What it does NOT decide: which question the dropdown asks (the core reads the row's label)
// or which option answers it (`api.pick`, the core's rule for the key: exact first, then
// years as brackets or a language level as words).

import { deepQueryAll } from '../../content/dom.js';

const OPTION = '[tz-dropdown-item], .tz-dropdown-item';
const label = (o) => (o.textContent || '').replace(/\s+/g, ' ').trim();

export default {
  id: 'taleez-select',
  kind: 'widget',
  match: { widget: (el) => el.localName === 'tz-select' },

  controls: (root) => deepQueryAll(root, 'tz-select'),

  /** The options only exist once it is opened. */
  options: () => true,

  /** Answered when the trigger shows a value rather than its "Choisir..." placeholder. */
  answered(el) {
    const shown = el.querySelector('.trigger .value');
    return Boolean(shown && !shown.classList.contains('placeholder') && label(shown));
  },

  async write(el, value, api) {
    const trigger = el.querySelector('.trigger') || el;
    if (!api.open(trigger)) return false;
    const options = await api.waitFor(() => {
      const found = api.popups().flatMap((p) => [...p.querySelectorAll(OPTION)]);
      return found.length ? found : null;
    });
    if (!options) return false;
    const i = api.pick(options.map(label), value);
    if (i === -1) {
      // Nothing fits: close the list again rather than leave it open over the form.
      const backdrop = api.popups().find((p) => p.classList?.contains('cdk-overlay-backdrop'));
      if (backdrop) api.choose(backdrop);
      return false;
    }
    return api.choose(options[i]) ? { ok: true } : false;
  },
};
