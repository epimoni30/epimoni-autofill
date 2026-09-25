// SPDX-License-Identifier: Apache-2.0
// Site filler: Workday ("My Experience", "My Information" steps).
//
// Workday marks every field wrapper with a stable `data-automation-id`, `formField-jobTitle`,
// `formField-companyName`, and every repeated row with a numbered one, `workExperience-2`.
// Those are better evidence than the visible label, which the customer can rename and
// translate. This filler only *reads* them: the field names become label evidence and the
// row numbers become block hints, both weighed by the core against everything else on the
// page. It writes nothing; Workday's dropdowns are ARIA comboboxes, which the aria-combobox
// widget filler already operates.
//
// Reconstructed from Workday's public markup conventions, not measured on a live tenant yet:
// see test/fixtures/fillers/workday/.

// Workday section ids → our CV sections (src/schema/fields.js).
const SECTIONS = {
  workExperience: 'work',
  education: 'education',
  language: 'languages',
  certification: 'certificates',
};

/** `formField-jobTitle` → "job title"; `formField-firstYearAttended` → "first year attended". */
const words = (id) =>
  id
    .replace(/^formField-/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();

export default {
  id: 'workday',
  kind: 'site',
  match: {
    hosts: ['*.myworkdayjobs.com', '*.myworkday.com', '*.workday.com'],
    // Workday is often embedded under a company's own careers domain.
    probe: (doc) =>
      Boolean(
        doc.querySelector('[data-automation-id^="workExperience-"], [data-automation-id^="formField-"]'),
      ),
  },

  describe(el) {
    const field = el.closest('[data-automation-id^="formField-"]');
    return field ? words(field.getAttribute('data-automation-id')) : null;
  },

  hint(el) {
    const row = el.closest('[data-automation-id]');
    for (let node = row; node; node = node.parentElement?.closest('[data-automation-id]')) {
      const m = node.getAttribute('data-automation-id').match(/^([a-zA-Z]+)-(\d+)$/);
      // Workday numbers its rows from 1.
      if (m && SECTIONS[m[1]]) return { section: SECTIONS[m[1]], index: Number(m[2]) - 1 };
    }
    return null;
  },
};
