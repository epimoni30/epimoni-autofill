// Reading a CvDoc from outside the vitrine.
//
// A CvDoc field is polymorphic: a plain string, a `{text}` wrapper, or a legacy
// `{diff: {tokens}}` block written by an older AI viewer. The site's CV builder is the
// authority on that shape and the backend reads it the same way; this is a third copy and it
// must stay behaviourally identical to both. Reading `.text` directly
// is the bug that silently fills a form field with "[object Object]".

import { MONTHS, ONGOING } from '../lexicon/index.js';
import { SECTIONS, sectionFields } from '../schema/fields.js';

const tokCurrent = (tokens) =>
  tokens
    .filter((t) => t && t.t !== 'del')
    .map((t) => t.s)
    .join('');
const tokOriginal = (tokens) =>
  tokens
    .filter((t) => t && t.t !== 'add')
    .map((t) => t.s)
    .join('');

/** Read a field that may be a plain string, a {text} wrapper, or an AI {diff}. */
export function fieldCurrent(f) {
  if (!f) return '';
  if (typeof f === 'string') return f;
  if (f.text != null) return String(f.text);
  // `reverted` matters: a reverted diff shows the original, not the proposal. Dropping
  // this check would fill forms with text the user explicitly rejected in the editor.
  if (f.diff) return f.diff.reverted ? tokOriginal(f.diff.tokens || []) : tokCurrent(f.diff.tokens || []);
  return '';
}

const str = (f) => fieldCurrent(f).trim();
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * `basics.location` is a dict with `city` in documents the builder wrote, but a bare
 * field in older ones. The backend handles both; so do we.
 */
function city(basics) {
  const loc = basics.location;
  if (loc && typeof loc === 'object' && !Array.isArray(loc) && loc.city !== undefined) return str(loc.city);
  return str(loc);
}

function profileUrl(basics, network) {
  const want = network.toLowerCase();
  const hit = arr(basics.profiles).find((p) =>
    String(p?.network || '')
      .toLowerCase()
      .includes(want),
  );
  return hit ? str(hit.url) : '';
}

/**
 * Split a display name into given/family.
 *
 * Deliberately naive (last whitespace group wins) because no heuristic is right for
 * every culture and the extension stores a user-editable override beside it. The point
 * of computing one at all is that the common case should need no typing; the point of
 * the override is that we never silently submit a wrong name.
 */
export function splitName(full) {
  const parts = String(full || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { given_name: '', family_name: '' };
  if (parts.length === 1) return { given_name: parts[0], family_name: '' };
  return { given_name: parts.slice(0, -1).join(' '), family_name: parts[parts.length - 1] };
}

// Month names and "ongoing" words come from the language packs (`src/lexicon/`), so a new
// language teaches the date parser along with the form filler. `ONGOING` is matched as a
// substring of the lowercased raw text, as the literal regex it replaces was.
const ONGOING_RE = new RegExp(ONGOING.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`: the only date shapes JSON Résumé accepts. */
export const ISO8601 = /^([1-2][0-9]{3}-[0-1][0-9]-[0-3][0-9]|[1-2][0-9]{3}-[0-1][0-9]|[1-2][0-9]{3})$/;

/**
 * A CvDoc date is free text: "2021", "Jan 2021", "01/2021", "en cours", "present", and,
 * since the extension imports JSON Résumé, "2021-06" too.
 *
 * Returns `'now'` for an ongoing role, `null` when there is no year to find, or
 * `{y, m, monthNamed}`. `monthNamed` records whether the source actually said a month, as
 * against `m` falling back to January: only the ISO export needs that, but it has to be
 * decided here, because by the time a date is a month count "2021" and "January 2021" are
 * the same number.
 */
function parseYm(raw) {
  const s = String(raw || '')
    .toLowerCase()
    .trim();
  if (!s) return null;
  if (ONGOING_RE.test(s)) return 'now';
  // An ISO date has its month in a position the free-text rules below would misread:
  // "2021-06" contains no month name and no `M/YYYY`, so it would silently become January.
  const iso = s.match(/^([1-2][0-9]{3})(?:-([0-1][0-9]))?(?:-[0-3][0-9])?$/);
  if (iso)
    return {
      y: Number(iso[1]),
      m: iso[2] ? Math.min(Math.max(Number(iso[2]), 1), 12) : 1,
      monthNamed: Boolean(iso[2]),
    };
  const year = s.match(/(19|20)\d{2}/);
  if (!year) return null;
  const y = Number(year[0]);
  let m = 1;
  let monthNamed = false;
  const slash = s.match(/\b(\d{1,2})\s*[/.-]\s*(19|20)\d{2}/);
  if (slash) {
    m = Number(slash[1]);
    monthNamed = true;
  } else {
    for (const [k, v] of Object.entries(MONTHS))
      if (s.includes(k)) {
        m = v;
        monthNamed = true;
        break;
      }
  }
  return { y, m: Math.min(Math.max(m, 1), 12), monthNamed };
}

/** The same date as a month count, for arithmetic. `'now'` and `null` pass through. */
function parseDate(raw) {
  const p = parseYm(raw);
  if (p === null || p === 'now') return p;
  return p.y * 12 + p.m;
}

/**
 * Free-text date → ISO 8601, or `''` when it cannot be said in ISO at all.
 *
 * "en cours" is the case that matters and it returns `''` deliberately: JSON Résumé has no
 * way to write "ongoing", it writes **no `endDate` at all**, and the caller drops the field
 * rather than inventing a date. That is not a loss: `yearsOfExperience` already reads a
 * missing end as "until now", so the standard's convention and ours already agree.
 *
 * A year with no month stays a bare year rather than becoming a false January.
 */
export function toIso8601(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (ISO8601.test(s)) return s;
  const p = parseYm(s);
  if (p === null || p === 'now') return '';
  return p.monthNamed ? `${p.y}-${String(p.m).padStart(2, '0')}` : String(p.y);
}

/**
 * Years of experience, summed over work entries rather than measured end-to-end, so a
 * career gap does not inflate the number. Overlapping roles are merged for the same
 * reason: two concurrent jobs are not twice the experience.
 *
 * Returned as a number for the form and shown to the user for confirmation before it is
 * ever submitted: the inputs are free-text strings and some of them will be unparseable.
 */
export function yearsOfExperience(
  work,
  nowMonths = new Date().getFullYear() * 12 + (new Date().getMonth() + 1),
) {
  const spans = [];
  for (const w of arr(work)) {
    const start = parseDate(w?.startDate);
    if (start === null || start === 'now') continue;
    const endRaw = parseDate(w?.endDate);
    const end = endRaw === 'now' || endRaw === null ? nowMonths : endRaw;
    if (end > start) spans.push([start, end]);
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0,
    [cs, ce] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      months += ce - cs;
      [cs, ce] = [s, e];
    }
  }
  months += ce - cs;
  return Math.round((months / 12) * 10) / 10;
}

/**
 * CvDoc (+ the extension-local extras the backend does not store) → the flat canonical
 * profile the resolver fills from. Keys here are exactly the keys the lexicon resolves
 * to; anything absent stays absent rather than becoming an empty string, because "we do
 * not know this" and "this is blank" must not fill the same way.
 */
export function toProfile(cvDoc, extras = {}) {
  const c = cvDoc && typeof cvDoc === 'object' ? cvDoc : {};
  const basics = c.basics && typeof c.basics === 'object' ? c.basics : {};
  const work = arr(c.work);
  const first = work[0] || {};
  const full = str(basics.name);
  const split = splitName(full);
  const yoe = yearsOfExperience(work);

  const out = {
    full_name: full,
    given_name: split.given_name,
    family_name: split.family_name,
    email: str(basics.email),
    email_confirm: str(basics.email),
    phone: str(basics.phone),
    city: city(basics),
    summary: str(basics.summary),
    current_title: str(basics.label) || str(first.position),
    current_employer: str(first.name),
    linkedin_url: profileUrl(basics, 'linkedin'),
    portfolio_url: profileUrl(basics, 'portfolio') || profileUrl(basics, 'site'),
    github_url: profileUrl(basics, 'github'),
    skills: arr(c.skills)
      .map((s) => str(s?.name))
      .filter(Boolean)
      .join(', '),
    languages: arr(c.languages)
      .map(
        (l) => [str(l?.language), str(l?.fluency)].filter(Boolean).join(' (') + (str(l?.fluency) ? ')' : ''),
      )
      .filter(Boolean)
      .join(', '),
    years_experience: yoe === null ? '' : String(yoe),
  };
  const edu = arr(c.education)[0];
  if (edu) {
    out.education_degree = str(edu.area);
    out.education_institution = str(edu.institution);
  }
  // Extras come last and win: they are what the user typed by hand, including any
  // correction to the name split above.
  for (const [k, v] of Object.entries(extras))
    if (v !== undefined && v !== null && v !== '') out[k] = String(v);
  // Never offer a value we do not have. An empty string filled into a form reads as an
  // answer; an absent key leaves the field alone.
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repeated sections, entry by entry.
//
// `toProfile` answers the questions a form asks once. A form that asks for the career block
// by block (one per job, one per degree) needs the entries themselves, keyed by the same
// field names the lexicon's scoped keys use (`work.company` → `entries.work[i].company`).

/** Every section of the document a form may ask for as repeated blocks. */
export const ENTRY_SECTIONS = SECTIONS;

/**
 * A free-text date → what a form control can be given.
 *
 * `m` is null unless the source named a month: "2016" must fill a year and leave a month
 * dropdown alone, not become January. `raw` is kept for a free-text field, where what the
 * person typed is the best answer there is.
 */
function dateOf(raw) {
  const text = str(raw);
  if (!text) return undefined;
  const p = parseYm(text);
  if (p === 'now') return { raw: text, y: null, m: null, ongoing: true };
  if (p === null) return { raw: text, y: null, m: null, ongoing: false };
  return { raw: text, y: p.y, m: p.monthNamed ? p.m : null, ongoing: false };
}

/** A summary and its bullets as one block of prose, one bullet per line. */
function prose(summary, highlights) {
  const bullets = arr(highlights)
    .map((h) => str(h))
    .filter(Boolean)
    .map((h) => `- ${h}`);
  return [str(summary), ...bullets].filter(Boolean).join('\n');
}

const words = (list) =>
  arr(list)
    .map((x) => str(x))
    .filter(Boolean)
    .join(', ');

// What `read` functions in the registry are handed, so the registry needs no imports.
const READERS = { str, date: (v) => dateOf(v), prose: (a, b) => prose(a, b), words: (l) => words(l) };

/** One CV entry → its fields as the registry defines them (`src/schema/fields.js`). */
function readEntry(section, raw) {
  const out = {};
  for (const f of sectionFields(section)) {
    if (f.read) out[f.field] = f.read(raw, READERS);
    else if (f.shape === 'date') out[f.field] = dateOf(raw[f.from]);
    else out[f.field] = str(raw[f.from]);
  }
  return out;
}

/**
 * CvDoc → `{work: [...], education: [...], …}`, one plain object per entry.
 *
 * Empty rows are dropped *before* indexing, so the form's third block takes the CV's third
 * real entry and not a blank row the editor left behind. A skill may be a bare string in the
 * wild, as `normalizeCvDoc` also accepts.
 */
export function toEntries(cvDoc) {
  const c = cvDoc && typeof cvDoc === 'object' ? cvDoc : {};
  const out = {};
  for (const section of ENTRY_SECTIONS) {
    const rows = arr(c[section])
      .map((raw) => (typeof raw === 'string' ? { name: raw } : raw && typeof raw === 'object' ? raw : {}))
      // `kept` (below, shared with the export) drops what we do not have: an absent field
      // leaves the control alone.
      .map((raw) => kept(readEntry(section, raw)))
      .filter((r) => Object.keys(r).length);
    if (rows.length) out[section] = rows;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writing a CvDoc, not just reading one.
//
// Everything above reads a document the site handed over. Everything below exists because
// the extension now has to be usable by somebody who has no Epimoni account at all: they
// type their CV here, or import one, and it has to come out in the *same* shape the builder
// writes, because three separate
// consumers read it and none of them will forgive a different one:
//
//   toProfile()               fills the form   (this file)
//   POST /ml/analyse/…-doc    scores the offer (server-side)
//   /editeur?id=…             opens it on the site, if there is ever a document to open
//
// The shape is the open CV structure the whole product is built on (JSON-Résumé lineage):
// `basics` + `work` + `education` + `skills` + `languages` + `certificates`. A field may be
// a bare string or a `{text}` wrapper and both flatten identically, so the normaliser
// accepts a plain JSON Résumé export without a translation layer.

export const CV_SECTIONS = ['work', 'education', 'skills', 'languages', 'certificates'];

let seq = 0;
/** Ids need only be unique inside one document, and stable while it is being edited. */
export const uid = (prefix) => {
  seq += 1;
  return `${prefix}${seq.toString(36)}`;
};

export const emptyWork = () => ({
  id: uid('w'),
  name: '',
  position: { text: '' },
  location: '',
  startDate: '',
  endDate: '',
  highlights: [],
});
export const emptyEducation = () => ({
  id: uid('e'),
  institution: '',
  area: '',
  startDate: '',
  endDate: '',
  details: '',
});
export const emptySkill = () => ({ id: uid('s'), name: '' });
export const emptyLanguage = () => ({ id: uid('l'), language: '', fluency: '' });
export const emptyCertificate = () => ({ id: uid('c'), name: '', date: '', issuer: '' });

/**
 * A blank document with the whole skeleton present.
 *
 * `meta` is copied from the builder's defaults rather than left out: a document that ever
 * reaches the site is opened by a renderer that reads these keys, and a missing
 * `sectionOrder` is the kind of absence that renders as an empty CV rather than as an error.
 */
export function createEmptyCv() {
  return {
    basics: {
      name: '',
      label: { text: '' },
      email: '',
      phone: '',
      location: { city: '' },
      profiles: [],
      summary: { text: '' },
    },
    work: [],
    education: [],
    skills: [],
    languages: [],
    certificates: [],
    meta: { sectionOrder: [...CV_SECTIONS] },
  };
}

const asArr = (v) => (Array.isArray(v) ? v : []);
// A field may arrive as a string, a {text} wrapper or a {diff}; `fieldCurrent` reads all
// three, and re-wrapping the result is what makes the round-trip idempotent.
const asText = (v) => ({ text: fieldCurrent(v) });

/**
 * Make any payload safe to store, fill from, and send to the analysis.
 *
 * Accepts three things on purpose, because all three are what a user will actually have:
 * the builder's own CvDoc, the `{cv, builderId, title}` draft the site keeps in
 * localStorage, and a plain JSON Résumé export from somewhere else. Nothing here guesses at
 * content: it only fills in the skeleton and repairs shapes, so an import that loses data
 * is a bug rather than a judgement call.
 */
export function normalizeCvDoc(raw) {
  const outer = raw && typeof raw === 'object' ? raw : {};
  // `{cv: …}` is the shape the site's own localStorage draft has, and the shape our export
  // writes. Unwrapping it here means "import the file you just exported" works.
  const src = outer.cv && typeof outer.cv === 'object' ? outer.cv : outer;
  const b = src.basics && typeof src.basics === 'object' ? src.basics : {};
  const base = createEmptyCv();
  const loc = b.location;

  return {
    ...base,
    ...src,
    basics: {
      ...base.basics,
      ...b,
      name: fieldCurrent(b.name),
      email: fieldCurrent(b.email),
      phone: fieldCurrent(b.phone),
      label: asText(b.label),
      summary: asText(b.summary),
      // JSON Résumé gives `location` an object with `city`; older documents of ours give a
      // bare string. Both are live, so both are normalised to the object the builder writes.
      location:
        loc && typeof loc === 'object' && !Array.isArray(loc)
          ? { ...loc, city: fieldCurrent(loc.city) }
          : { city: fieldCurrent(loc) },
      profiles: asArr(b.profiles)
        .map((p) => ({ network: fieldCurrent(p?.network), url: fieldCurrent(p?.url) }))
        .filter((p) => p.url),
    },
    work: asArr(src.work).map((w) => ({
      ...w,
      id: w?.id || uid('w'),
      name: fieldCurrent(w?.name),
      position: asText(w?.position),
      // A highlight is a bare string in JSON Résumé and `{id, text}` in ours.
      highlights: asArr(w?.highlights)
        .map((h) => ({ id: h?.id || uid('h'), text: fieldCurrent(h) }))
        .filter((h) => h.text),
    })),
    education: asArr(src.education).map((e) => ({
      ...e,
      id: e?.id || uid('e'),
      // JSON Résumé gives an education entry no free-text field. It has `courses`, an
      // array, while ours has one `details` string. Folding `courses` in means a résumé
      // written elsewhere imports with its content instead of as a blank row. The original
      // array is left in place, so exporting it again loses nothing.
      details:
        fieldCurrent(e?.details) ||
        asArr(e?.courses)
          .map((c) => fieldCurrent(c))
          .filter(Boolean)
          .join(' · '),
    })),
    // JSON Résumé allows a skill to be `{name, keywords}` or, in the wild, a bare string.
    skills: asArr(src.skills).map((s) => ({
      ...(typeof s === 'string' ? {} : s),
      id: s?.id || uid('s'),
      name: fieldCurrent(typeof s === 'string' ? s : s?.name),
    })),
    languages: asArr(src.languages).map((l) => ({
      ...l,
      id: l?.id || uid('l'),
      language: fieldCurrent(l?.language),
      fluency: fieldCurrent(l?.fluency),
    })),
    certificates: asArr(src.certificates).map((c) => ({
      ...c,
      id: c?.id || uid('c'),
      name: fieldCurrent(c?.name),
    })),
    meta: { ...base.meta, ...(src.meta && typeof src.meta === 'object' ? src.meta : {}) },
  };
}

/**
 * What this document actually holds, for a surface that has to tell the user whether it is
 * worth anything yet.
 *
 * `fields` is the number the rest of the extension already speaks in (the count of
 * canonical profile keys a form can be filled from) so the options page and the popup
 * cannot disagree about how complete the same CV is.
 */
export function cvSummary(cv, extras = {}) {
  const doc = cv && typeof cv === 'object' ? cv : {};
  const rows = (k) =>
    asArr(doc[k]).filter(
      (r) =>
        fieldCurrent(r?.name) ||
        fieldCurrent(r?.language) ||
        fieldCurrent(r?.institution) ||
        fieldCurrent(r?.position),
    ).length;
  return {
    name: fieldCurrent(doc.basics?.name),
    fields: Object.keys(toProfile(doc, extras)).length,
    work: rows('work'),
    education: rows('education'),
    skills: asArr(doc.skills).filter((s) => fieldCurrent(s?.name)).length,
    languages: asArr(doc.languages).filter((l) => fieldCurrent(l?.language)).length,
  };
}

/**
 * Is there enough here to be worth sending to the offer comparison?
 *
 * The floor is deliberately the same idea as the advert's 40-word floor: refuse the inputs
 * that can only produce a meaningless answer, rather than charging somebody a quota for one.
 * A name and one of (a role, an experience, a skill) is the least that scores as anything.
 */
export function cvIsAnalysable(cv) {
  const s = cvSummary(cv);
  return Boolean(s.name) && (s.work > 0 || s.skills > 0 || s.education > 0);
}

// ── JSON Résumé ────────────────────────────────────────────────────────────────────────
//
// The document above is JSON Résumé-*shaped*, not conformant: it wraps `label`, `summary`
// and `position` in `{text}` so the builder can hang an AI diff off them, writes a
// highlight as `{id, text}` so a list can be reordered without re-keying, and keeps dates
// as the free text a person typed. Every one of those is deliberate and none of them is
// what the standard says, so a file exported raw would not open in any other tool.
//
// These two functions are the boundary. Inside, the shape stays ours; on the way out it is
// a `resume.json` anyone's renderer or parser will accept, and on the way in anyone's
// `resume.json` is accepted, which is the whole point of storing a CV in an open format
// rather than merely resembling one.

const SCHEMA_URL = 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json';
export const JSON_RESUME_VERSION = 'v1.0.0';

/**
 * Drop empty values rather than exporting `"email": ""`.
 *
 * Not cosmetic: several standard fields carry a `format` (email, uri), and an empty string
 * fails those validators that enforce it. Absent is the shape the standard expects for
 * "not stated".
 */
function kept(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (Array.isArray(v) ? !v.length : typeof v === 'object' && !Object.keys(v).length) continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/** projects, volunteer, awards, publications, interests, references → JSON Résumé. */
function optionalSections(cv, span) {
  const text = (v) => fieldCurrent(v);
  const bullets = (h) =>
    asArr(h)
      .map((x) => fieldCurrent(x))
      .filter(Boolean);
  const list = (name, map) => {
    const rows = asArr(cv[name])
      .map((r) => kept(map(r && typeof r === 'object' ? r : {})))
      .filter((r) => Object.keys(r).length);
    return rows.length ? { [name]: rows } : {};
  };
  const date = (v) => toIso8601(text(v));
  return {
    ...list('volunteer', (v) => ({
      organization: text(v.organization),
      position: text(v.position),
      url: text(v.url),
      ...span(v),
      summary: text(v.summary),
      highlights: bullets(v.highlights),
    })),
    ...list('awards', (a) => ({
      title: text(a.title),
      date: date(a.date),
      awarder: text(a.awarder),
      summary: text(a.summary),
    })),
    ...list('publications', (p) => ({
      name: text(p.name),
      publisher: text(p.publisher),
      releaseDate: date(p.releaseDate),
      url: text(p.url),
      summary: text(p.summary),
    })),
    ...list('interests', (i) => ({ name: text(i.name), keywords: bullets(i.keywords) })),
    ...list('references', (r) => ({ name: text(r.name), reference: text(r.reference) })),
    ...list('projects', (p) => ({
      name: text(p.name),
      description: text(p.description),
      url: text(p.url),
      ...span(p),
      highlights: bullets(p.highlights),
    })),
  };
}

/** Our CvDoc → a valid `resume.json`. */
export function toJsonResume(cvDoc) {
  const cv = normalizeCvDoc(cvDoc);
  const b = cv.basics || {};
  // An ongoing role exports with no `endDate`, which is how the standard says "current".
  const span = (r) => kept({ startDate: toIso8601(r?.startDate), endDate: toIso8601(r?.endDate) });
  const nonEmpty = (rows) => rows.filter((r) => Object.keys(r).length);

  return kept({
    basics: kept({
      name: fieldCurrent(b.name),
      label: fieldCurrent(b.label),
      email: fieldCurrent(b.email),
      phone: fieldCurrent(b.phone),
      summary: fieldCurrent(b.summary),
      location: kept({ city: fieldCurrent(b.location?.city) }),
      profiles: nonEmpty(
        asArr(b.profiles).map((x) => kept({ network: fieldCurrent(x?.network), url: fieldCurrent(x?.url) })),
      ).filter((x) => x.url),
    }),
    work: nonEmpty(
      asArr(cv.work).map((w) =>
        kept({
          name: fieldCurrent(w?.name),
          position: fieldCurrent(w?.position),
          location: fieldCurrent(w?.location),
          ...span(w),
          highlights: asArr(w?.highlights)
            .map((h) => fieldCurrent(h))
            .filter(Boolean),
        }),
      ),
    ),
    education: nonEmpty(
      asArr(cv.education).map((e) =>
        kept({
          institution: fieldCurrent(e?.institution),
          area: fieldCurrent(e?.area),
          studyType: fieldCurrent(e?.studyType),
          ...span(e),
          courses: asArr(e?.courses)
            .map((c) => fieldCurrent(c))
            .filter(Boolean),
          // Ours, and valid: every object in the schema sets `additionalProperties: true`.
          details: fieldCurrent(e?.details),
        }),
      ),
    ),
    skills: nonEmpty(
      asArr(cv.skills).map((x) =>
        kept({
          name: fieldCurrent(x?.name),
          level: fieldCurrent(x?.level),
          keywords: asArr(x?.keywords)
            .map((k) => fieldCurrent(k))
            .filter(Boolean),
        }),
      ),
    ).filter((x) => x.name),
    languages: nonEmpty(
      asArr(cv.languages).map((x) =>
        kept({
          language: fieldCurrent(x?.language),
          fluency: fieldCurrent(x?.fluency),
        }),
      ),
    ).filter((x) => x.language),
    certificates: nonEmpty(
      asArr(cv.certificates).map((x) =>
        kept({
          name: fieldCurrent(x?.name),
          date: toIso8601(x?.date),
          issuer: fieldCurrent(x?.issuer),
          url: fieldCurrent(x?.url),
        }),
      ),
    ).filter((x) => x.name),
    // The sections the builder calls optional. They used to be dropped here (a document
    // imported with projects and awards exported without them) and a form can now be
    // filled from every one, so the file has to carry them too.
    ...optionalSections(cv, span),
    meta: kept({ ...(cv.meta || {}), canonical: SCHEMA_URL, version: JSON_RESUME_VERSION }),
  });
}

/**
 * Anyone's `resume.json` → our CvDoc.
 *
 * `normalizeCvDoc` was already written to be tolerant on the way in: it accepts a bare
 * string where we store `{text}`, a bare-string highlight, a string skill, and a string
 * `location`, so this is that same door, named for the format it is the door *for*.
 */
export function fromJsonResume(json) {
  return normalizeCvDoc(json);
}

/**
 * Where a document would fail the published schema, as a list of plain sentences.
 *
 * A real JSON-Schema validator is a dependency, and this project has none. What is worth
 * checking without one is the part our own shapes actually break: the `{text}` wrappers,
 * the object-shaped highlights, and dates that are not ISO. Anything this reports is a bug
 * in `toJsonResume`, which is why the test suite asserts it stays empty.
 */
export function jsonResumeProblems(resume) {
  const out = [];
  const doc = resume && typeof resume === 'object' ? resume : {};
  const isStr = (v) => v === undefined || typeof v === 'string';
  const date = (v, where) => {
    if (v !== undefined && !ISO8601.test(String(v))) out.push(`${where}: "${v}" is not an ISO 8601 date`);
  };
  const strField = (v, where) => {
    if (!isStr(v)) out.push(`${where}: expected a string, got ${Array.isArray(v) ? 'an array' : typeof v}`);
  };

  strField(doc.basics?.label, 'basics.label');
  strField(doc.basics?.summary, 'basics.summary');
  strField(doc.basics?.name, 'basics.name');
  for (const [i, w] of asArr(doc.work).entries()) {
    strField(w?.position, `work[${i}].position`);
    strField(w?.name, `work[${i}].name`);
    date(w?.startDate, `work[${i}].startDate`);
    date(w?.endDate, `work[${i}].endDate`);
    for (const [j, h] of asArr(w?.highlights).entries()) strField(h, `work[${i}].highlights[${j}]`);
  }
  for (const [i, e] of asArr(doc.education).entries()) {
    date(e?.startDate, `education[${i}].startDate`);
    date(e?.endDate, `education[${i}].endDate`);
  }
  for (const [i, c] of asArr(doc.certificates).entries()) date(c?.date, `certificates[${i}].date`);
  for (const [i, x] of asArr(doc.skills).entries()) strField(x?.name, `skills[${i}].name`);
  for (const name of ['volunteer', 'projects'])
    for (const [i, x] of asArr(doc[name]).entries()) {
      date(x?.startDate, `${name}[${i}].startDate`);
      date(x?.endDate, `${name}[${i}].endDate`);
      for (const [j, h] of asArr(x?.highlights).entries()) strField(h, `${name}[${i}].highlights[${j}]`);
    }
  for (const [i, a] of asArr(doc.awards).entries()) date(a?.date, `awards[${i}].date`);
  for (const [i, p] of asArr(doc.publications).entries())
    date(p?.releaseDate, `publications[${i}].releaseDate`);
  return out;
}
