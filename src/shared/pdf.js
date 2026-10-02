// SPDX-License-Identifier: Apache-2.0
// A CV as a PDF, written by hand: the file a form's CV upload receives when the user has not
// attached one of their own. Also the cover letter, when the user wants it as a file.
//
// No dependency, on purpose. The extension ships no bundler and no third-party code, and a
// PDF library with its fonts would be most of the package. What a CV needs is small: text in
// two weights, a rule under each heading, wrapping, and pages. The PDF's standard fonts
// (Helvetica and Helvetica-Bold) are built into every reader, so nothing is embedded, and
// their WinAnsi encoding covers French and Spanish, "œ" and "€" included. A character it
// cannot encode is written without its accent, or as "?", rather than breaking the file.
//
// One column of real text, top to bottom, which is also the layout an applicant tracking
// system reads most reliably. Deterministic: the same CV gives the same bytes, so a test can
// compare them, and nothing in the file says when or on which machine it was made.
//
// Pure: it takes the JSON Résumé export (`toJsonResume`) and the section titles, and returns
// bytes. It knows nothing about storage, the DOM or `chrome`.

const PAGE_W = 595.28; // A4, in points
const PAGE_H = 841.89;
const MARGIN = 50;
const TEXT_W = PAGE_W - 2 * MARGIN;
const INK = '0.09 0.09 0.11';
const MUTED = '0.42 0.42 0.46';
const ACCENT = '0.486 0.361 1';

// Advance widths of the two standard fonts, in thousandths of the font size, for the printable
// ASCII range 32–126. From the Adobe font metrics every PDF reader carries.
// biome-ignore format: a table
const HELV = [
  278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,
  556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,
  556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,
];
// biome-ignore format: a table
const HELV_BOLD = [
  278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,
  556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,
  611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,
];
// The WinAnsi characters outside Latin-1 that a CV actually contains, with their byte and width
// (regular, bold).
const EXTRA = {
  '€': [0x80, 556, 556],
  '…': [0x85, 1000, 1000],
  '‘': [0x91, 222, 278],
  '’': [0x92, 222, 278],
  '“': [0x93, 333, 500],
  '”': [0x94, 333, 500],
  '•': [0x95, 350, 350],
  '–': [0x96, 556, 556],
  '—': [0x97, 1000, 1000],
  Œ: [0x8c, 1000, 1000],
  œ: [0x9c, 944, 944],
  Ÿ: [0x9f, 667, 667],
};

// Letters Unicode does not decompose into a base and an accent, so NFD cannot strip them.
const PLAIN = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', Ħ: 'H', ħ: 'h', ı: 'i' };

/** One character → its WinAnsi byte, or null when the encoding has no place for it. */
function byteOf(ch) {
  if (EXTRA[ch]) return EXTRA[ch][0];
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return c;
  if (c >= 0xa0 && c <= 0xff) return c;
  return null;
}

/**
 * Text the two fonts can draw: typographic spaces made plain, every other character either
 * encodable, or its unaccented letter, or "?". Line breaks become spaces: layout is ours.
 */
export function encodable(text) {
  let out = '';
  for (const ch of String(text ?? '').replace(/[\s   ]+/g, ' ')) {
    if (byteOf(ch) !== null) out += ch;
    else {
      const base = PLAIN[ch] || ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base && [...base].every((b) => byteOf(b) !== null) ? base : '?';
    }
  }
  return out;
}

function charWidth(ch, bold) {
  if (EXTRA[ch]) return EXTRA[ch][bold ? 2 : 1];
  const c = ch.charCodeAt(0);
  const table = bold ? HELV_BOLD : HELV;
  if (c >= 32 && c <= 126) return table[c - 32];
  // A Latin-1 letter is as wide as the letter under its accent; the rest are near enough.
  const base = ch.normalize('NFD')[0];
  const b = base.charCodeAt(0);
  if (b >= 32 && b <= 126) return table[b - 32];
  return 556;
}

/** Width of `text` in points at `size`. */
export function textWidth(text, size, bold = false) {
  let w = 0;
  for (const ch of text) w += charWidth(ch, bold);
  return (w * size) / 1000;
}

/** Break `text` into lines no wider than `width`. A word longer than a line is cut. */
export function wrap(text, size, width, bold = false) {
  const lines = [];
  let line = '';
  for (const word of encodable(text).split(' ').filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, bold) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    let rest = word;
    while (textWidth(rest, size, bold) > width) {
      let cut = rest.length - 1;
      while (cut > 1 && textWidth(rest.slice(0, cut), size, bold) > width) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

/** A PDF literal string, kept 7-bit: anything above ASCII is written as an octal escape. */
function literal(text) {
  let out = '(';
  for (const ch of text) {
    const b = byteOf(ch);
    if (b === null) continue;
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (b < 128) out += ch;
    else out += `\\${b.toString(8).padStart(3, '0')}`;
  }
  return `${out})`;
}

const FALLBACK_LABELS = {
  profile: 'Profile',
  work: 'Work experience',
  education: 'Education',
  projects: 'Projects',
  certificates: 'Certifications',
  skills: 'Skills',
  languages: 'Languages',
  present: 'present',
};

const num = (n) => Number(n.toFixed(2)).toString();

/** "2021-06" → "06/2021", "2016" → "2016". A date is never given more precision than it had. */
function dateOf(iso) {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return m[2] ? `${m[2]}/${m[1]}` : m[1];
}

function span(r, present) {
  const from = dateOf(r.startDate);
  const to = r.endDate ? dateOf(r.endDate) : from ? present : '';
  if (!from) return to && to !== present ? to : '';
  return from === to ? from : `${from} – ${to}`;
}

const joined = (...parts) => parts.map((p) => String(p || '').trim()).filter(Boolean);

/**
 * Lay the CV out as pages of drawing operations.
 *
 * `labels` holds the section titles and the word for an ongoing role, in the user's language:
 * `{profile, work, education, projects, certificates, skills, languages, present}`.
 */
function layout(resume, labels) {
  const pages = [];
  let ops = [];
  let y = PAGE_H - MARGIN;
  const newPage = () => {
    ops = [];
    pages.push(ops);
    y = PAGE_H - MARGIN;
  };
  newPage();
  const room = (h) => {
    if (y - h < MARGIN) newPage();
  };
  const text = (x, str, size, { bold = false, color = INK } = {}) => {
    ops.push(
      `BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${color} rg ${num(x)} ${num(y)} Td ${literal(str)} Tj ET`,
    );
  };
  const para = (str, size, { bold = false, color = INK, indent = 0, lead = 1.35 } = {}) => {
    for (const line of wrap(str, size, TEXT_W - indent, bold)) {
      room(size * lead);
      y -= size * lead;
      text(MARGIN + indent, line, size, { bold, color });
    }
  };
  // A title line with its dates flush right, the dates taking the room they need first.
  const titled = (title, right, size = 10.5) => {
    const r = encodable(right);
    const rw = r ? textWidth(r, 9) + 12 : 0;
    const lines = wrap(title, size, TEXT_W - rw, true);
    room(size * 1.4 * Math.max(1, lines.length) + 4);
    y -= 4;
    lines.forEach((line, i) => {
      y -= size * 1.4;
      text(MARGIN, line, size, { bold: true });
      if (i === 0 && r) text(PAGE_W - MARGIN - textWidth(r, 9), r, 9, { color: MUTED });
    });
  };
  const heading = (label) => {
    room(40);
    y -= 18;
    text(MARGIN, encodable(label).toUpperCase(), 10, { bold: true, color: ACCENT });
    y -= 5;
    ops.push(`${ACCENT} RG 0.6 w ${num(MARGIN)} ${num(y)} m ${num(PAGE_W - MARGIN)} ${num(y)} l S`);
    y -= 2;
  };
  const bullets = (items) => {
    for (const item of items) {
      const lines = wrap(item, 9.5, TEXT_W - 12);
      lines.forEach((line, i) => {
        room(9.5 * 1.35);
        y -= 9.5 * 1.35;
        if (i === 0) text(MARGIN + 2, '•', 9.5, { color: MUTED });
        text(MARGIN + 12, line, 9.5);
      });
    }
  };

  const b = resume.basics || {};
  if (b.name) {
    y -= 22;
    text(MARGIN, encodable(b.name), 22, { bold: true });
    y -= 4;
  }
  if (b.label) para(b.label, 12, { color: MUTED });
  const contact = joined(
    b.email,
    b.phone,
    b.location?.city,
    ...(b.profiles || []).map((p) => String(p.url || '').replace(/^https?:\/\/(www\.)?/, '')),
    String(b.url || '').replace(/^https?:\/\/(www\.)?/, ''),
  );
  if (contact.length) {
    y -= 4;
    para(contact.join('  ·  '), 9.5, { color: MUTED });
  }
  if (b.summary) {
    heading(labels.profile);
    y -= 2;
    para(b.summary, 10);
  }

  const work = resume.work || [];
  if (work.length) {
    heading(labels.work);
    for (const w of work) {
      titled(joined(w.position, w.name).join(' · ') || '', span(w, labels.present));
      if (w.location) para(w.location, 9.5, { color: MUTED });
      if (w.summary) para(w.summary, 9.5);
      bullets(w.highlights || []);
    }
  }

  const projects = resume.projects || [];
  if (projects.length) {
    heading(labels.projects);
    for (const p of projects) {
      titled(p.name || '', span(p, labels.present));
      if (p.description) para(p.description, 9.5);
      bullets(p.highlights || []);
    }
  }

  const education = resume.education || [];
  if (education.length) {
    heading(labels.education);
    for (const e of education) {
      const degree = joined(e.studyType, e.area).join(', ');
      titled(degree || e.institution || '', span(e, labels.present));
      if (degree && e.institution) para(e.institution, 9.5, { color: MUTED });
      if (e.details) para(e.details, 9.5);
      if (e.courses?.length) para(e.courses.join(', '), 9.5);
    }
  }

  const certificates = resume.certificates || [];
  if (certificates.length) {
    heading(labels.certificates);
    for (const c of certificates) titled(joined(c.name, c.issuer).join(' · '), dateOf(c.date), 10);
  }

  const skills = resume.skills || [];
  if (skills.length) {
    heading(labels.skills);
    y -= 2;
    if (skills.some((s) => s.keywords?.length))
      for (const s of skills) para(joined(s.name, (s.keywords || []).join(', ')).join(' : '), 9.5);
    else para(skills.map((s) => s.name).join(' · '), 9.5);
  }

  const languages = resume.languages || [];
  if (languages.length) {
    heading(labels.languages);
    y -= 2;
    para(languages.map((l) => (l.fluency ? `${l.language} (${l.fluency})` : l.language)).join(' · '), 9.5);
  }
  return pages;
}

/**
 * The whole file, as bytes, from pages of drawing operations.
 *
 * Objects: 1 catalog, 2 page tree, 3 and 4 the fonts, 5 the document info, then a page and its
 * content stream for each page. The file is 7-bit ASCII throughout (strings are escaped), so a
 * character offset is a byte offset and the cross-reference table can be computed from lengths.
 */
function writePdf(pages, { title, author }) {
  const objects = [];
  const pageIds = pages.map((_, i) => 6 + 2 * i);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objects[5] = `<< /Title ${literal(title)} /Author ${literal(author)} /Creator (Epimoni Autofill) >>`;
  pages.forEach((ops, i) => {
    const stream = ops.join('\n');
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i);
  return bytes;
}

/** The CV as a PDF. A missing section title falls back to English rather than going unnamed. */
export function renderCvPdf(resume, labels) {
  const titles = { ...FALLBACK_LABELS };
  for (const [k, v] of Object.entries(labels || {})) if (v) titles[k] = v;
  const name = encodable(resume?.basics?.name || '');
  return writePdf(layout(resume || {}, titles), { title: name || 'CV', author: name });
}

/**
 * A cover letter as a PDF: the sender's name and contact at the top, the place and date, the
 * company, the subject line, then the letter's paragraphs as written, and the name again.
 *
 * `letter`: `{ paragraphs: string[], subject?, company?, date? }`, the date already worded in
 * the user's language ("Lyon, le 2 octobre 2026"). `basics` is the CV's, in JSON Résumé shape.
 * The text is the user's, generated and read by them; this only sets it on a page.
 */
export function renderLetterPdf(letter, basics = {}) {
  const pages = [];
  let ops = [];
  let y = PAGE_H - MARGIN;
  const newPage = () => {
    ops = [];
    pages.push(ops);
    y = PAGE_H - MARGIN;
  };
  newPage();
  const text = (x, str, size, { bold = false, color = INK } = {}) => {
    ops.push(
      `BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${color} rg ${num(x)} ${num(y)} Td ${literal(str)} Tj ET`,
    );
  };
  const para = (str, size, { bold = false, color = INK, lead = 1.45 } = {}) => {
    for (const line of wrap(str, size, TEXT_W, bold)) {
      if (y - size * lead < MARGIN) newPage();
      y -= size * lead;
      text(MARGIN, line, size, { bold, color });
    }
  };

  const name = encodable(basics.name || '');
  if (name) para(name, 13, { bold: true });
  const contact = joined(basics.email, basics.phone, basics.location?.city);
  if (contact.length) para(contact.join('  ·  '), 9.5, { color: MUTED });

  if (letter.date) {
    y -= 18;
    const d = encodable(letter.date);
    y -= 10.5 * 1.45;
    text(PAGE_W - MARGIN - textWidth(d, 10.5), d, 10.5);
  }
  if (letter.company) {
    y -= 8;
    para(letter.company, 10.5, { bold: true });
  }
  if (letter.subject) {
    y -= 16;
    para(letter.subject, 10.5, { bold: true });
  }
  y -= 14;
  for (const p of letter.paragraphs || []) {
    if (!String(p || '').trim()) continue;
    para(p, 10.5);
    y -= 8;
  }
  if (name) {
    y -= 10;
    para(name, 10.5);
  }
  return writePdf(pages, { title: encodable(letter.subject || '') || 'Lettre', author: name });
}

/** Enough to be worth sending an employer: a name, and something besides it. */
export function cvIsPrintable(resume) {
  const r = resume || {};
  return Boolean(
    r.basics?.name && (r.work?.length || r.education?.length || r.skills?.length || r.basics?.summary),
  );
}

/** A file name from the person's name: "CV-Camille-Dupont.pdf", or "Lettre-…" with a prefix. */
export function pdfName(resume, prefix = 'CV') {
  const slug = encodable(resume?.basics?.name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug ? `${prefix}-${slug}.pdf` : `${prefix}.pdf`;
}
