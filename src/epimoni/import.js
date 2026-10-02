// SPDX-License-Identifier: Apache-2.0
// A CV's raw text, structured by Epimoni's parser, as a CvDoc.
//
// `/ml/cv-extract-text` runs the backend's verbatim extractor (it copies, never rewrites) and
// answers with its fields: `contact`, `title`, `summary`, `experiences[{title, company, period,
// location, bullets}]`, `education[{degree, institution, period, details}]`, `skills[]`,
// `languages[{language, level}]`, `certifications[]`. This maps them onto the document the
// extension keeps, the way the site's builder maps the same shape on its own imports.
//
// A period stays the free text the CV wrote ("janv. 2021 – mars 2023"), split in two: a CvDoc
// date is free text, and the readers downstream already understand "aujourd'hui" and "present".
//
// Pure: no storage, no network, no `chrome`.

import { normalizeCvDoc, uid } from '../shared/cvdoc.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);

/** "Jan 2021 – Mar 2023" → ["Jan 2021", "Mar 2023"]; "2016" → ["", "2016"] for a diploma. */
export function splitPeriod(period, single = 'start') {
  const p = str(period);
  if (!p) return ['', ''];
  const parts = p
    .split(/\s+(?:[–—-]|à|au|to|until|hasta|até)\s+|\s*[–—]\s*/i)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts.at(-1)];
  return single === 'end' ? ['', parts[0] || ''] : [parts[0] || '', ''];
}

export function fromExtraction(structured) {
  const s = structured && typeof structured === 'object' ? structured : {};
  const c = s.contact || {};
  const profiles = [];
  if (str(c.linkedin)) profiles.push({ network: 'LinkedIn', url: str(c.linkedin) });
  if (str(c.portfolio)) profiles.push({ network: 'Portfolio', url: str(c.portfolio) });
  return normalizeCvDoc({
    basics: {
      name: str(c.name),
      email: str(c.email),
      phone: str(c.phone),
      location: { city: str(c.location) },
      label: { text: str(s.title) },
      summary: { text: str(s.summary) },
      profiles,
    },
    work: list(s.experiences).map((e) => {
      const [startDate, endDate] = splitPeriod(e?.period);
      return {
        id: uid('w'),
        name: str(e?.company),
        position: { text: str(e?.title) },
        location: str(e?.location),
        startDate,
        endDate,
        highlights: list(e?.bullets)
          .map(str)
          .filter(Boolean)
          .map((text) => ({ id: uid('h'), text })),
      };
    }),
    education: list(s.education).map((e) => {
      const [startDate, endDate] = splitPeriod(e?.period, 'end');
      return {
        id: uid('e'),
        institution: str(e?.institution),
        area: str(e?.degree),
        startDate,
        endDate,
        details: str(e?.details),
      };
    }),
    skills: list(s.skills)
      .map(str)
      .filter(Boolean)
      .map((name) => ({ id: uid('s'), name })),
    languages: list(s.languages)
      .filter((l) => str(l?.language))
      .map((l) => ({ id: uid('l'), language: str(l.language), fluency: str(l.level) })),
    certificates: list(s.certifications)
      .map(str)
      .filter(Boolean)
      .map((name) => ({ id: uid('c'), name, date: '', issuer: '' })),
  });
}
