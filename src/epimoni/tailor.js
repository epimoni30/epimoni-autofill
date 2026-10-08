// SPDX-License-Identifier: Apache-2.0
// A CV adapted to one advert: Epimoni's rewrite proposals, reviewed by the user, applied to a
// copy of the document.
//
// The backend's CV writer (`/ml/analyse/write-cv-doc`) answers with `changes`, one per field it
// rewrote, keyed the way its schema names them: `title`, `summary`, `skills`, `languages`,
// `certifications`, `experience.N.title`, `experience.N.bullets`, where N is the role's index in
// the document. A list comes back as one string, an item per line.
//
// They are proposals, not edits, and that is not caution for its own sake. Measured against the
// real writer on 2026-10-02, a role with no bullets came back with two, lifted from the advert
// ("Animation et gestion des réseaux sociaux, y compris LinkedIn et Instagram"), and another
// gained an "SEO" task the CV never mentions. Applied blindly, that is a CV claiming experience
// its owner does not have, sent to an employer. So `proposalsFrom` marks every change that adds
// material (a field that was empty, a list that grew) as `adds`, the surface leaves those
// unticked, and only what the user ticked is applied.
//
// Conservative where the shape is lossy. A role index the document does not have is skipped
// rather than appended, a change that changes nothing is dropped, and a list the model emptied
// is not applied. Skills, languages and certificates keep every field the user wrote (keywords,
// issuer, date) when the rewritten line names the same thing.
//
// Pure: no storage, no network, no `chrome`.

import { fieldCurrent, normalizeCvDoc, uid } from '../shared/cvdoc.js';

const lines = (text) =>
  String(text ?? '')
    .split('\n')
    .map((l) => l.replace(/^[\s•·\-–*]+/, '').trim())
    .filter(Boolean);
const same = (a, b) =>
  String(a || '')
    .trim()
    .toLowerCase() ===
  String(b || '')
    .trim()
    .toLowerCase();

/** "Anglais — Courant", "Anglais (courant)", "Anglais: C1" → {language, fluency}. */
function languageOf(line) {
  const m = /^(.+?)\s*[—–:-]\s*(.+)$/.exec(line) || /^(.+?)\s*\((.+)\)$/.exec(line);
  return m ? { language: m[1].trim(), fluency: m[2].trim() } : { language: line, fluency: '' };
}

const LIST_KEYS = new Set(['skills', 'languages', 'certifications']);

/** What the document holds today under a change key, as the lines the writer compares. */
function currentLines(doc, key) {
  if (key === 'title') return lines(fieldCurrent(doc.basics.label));
  if (key === 'summary') return lines(fieldCurrent(doc.basics.summary));
  if (key === 'skills') return doc.skills.map((s) => s.name).filter(Boolean);
  if (key === 'languages')
    return doc.languages.map((l) => [l.language, l.fluency].filter(Boolean).join(' — ')).filter(Boolean);
  if (key === 'certifications') return doc.certificates.map((c) => c.name).filter(Boolean);
  const m = /^experience\.(\d+)\.(title|bullets)$/.exec(key);
  const role = m ? doc.work[Number(m[1])] : null;
  if (!role) return null;
  return m[2] === 'title'
    ? lines(fieldCurrent(role.position))
    : role.highlights.map((h) => h.text).filter(Boolean);
}

/**
 * The changes worth showing, in the writer's order, each with its index in `changes` (what
 * the user's choice refers back to), what it proposes, and `adds`: how many lines it brings
 * that the field did not have, or 1 for a field that was empty. Anything that adds is for the
 * user to vouch for, not for us to assume.
 */
export function proposalsFrom(cv, changes) {
  const doc = normalizeCvDoc(structuredClone(cv));
  const out = [];
  (Array.isArray(changes) ? changes : []).forEach((c, i) => {
    const key = String(c?.key || '');
    const improved = typeof c?.improved === 'string' ? c.improved.trim() : '';
    if (!key || !improved) return;
    const before = currentLines(doc, key);
    if (before === null) return;
    const after = lines(improved);
    if (!after.length) return;
    if (after.length === before.length && after.every((l, j) => same(l, before[j]))) return;
    let adds = 0;
    if (!before.length) adds = 1;
    else if (LIST_KEYS.has(key)) adds = after.filter((l) => !before.some((b) => same(b, l))).length;
    else if (key.endsWith('.bullets')) adds = Math.max(0, after.length - before.length);
    out.push({
      i,
      key,
      improved: after.join('\n'),
      reason: typeof c.reason === 'string' ? c.reason : '',
      adds,
    });
  });
  return out;
}

/**
 * Apply the writer's changes to a copy of `cv`. Returns the new document and the changes that
 * landed, each with the reason the backend gave (shown to the user as the "why").
 */
export function applyRewrite(cv, changes) {
  const doc = normalizeCvDoc(structuredClone(cv));
  const applied = [];
  for (const c of Array.isArray(changes) ? changes : []) {
    const key = String(c?.key || '');
    const text = typeof c?.improved === 'string' ? c.improved.trim() : '';
    if (!key || !text) continue;
    const done = () => applied.push({ key, reason: typeof c.reason === 'string' ? c.reason : '' });

    if (key === 'title') {
      doc.basics.label = { text };
      done();
    } else if (key === 'summary') {
      doc.basics.summary = { text };
      done();
    } else if (key === 'skills') {
      const names = lines(text);
      if (!names.length) continue;
      doc.skills = names.map((name) => {
        const was = doc.skills.find((s) => same(s.name, name));
        return was ? { ...was, name } : { id: uid('s'), name };
      });
      done();
    } else if (key === 'languages') {
      const rows = lines(text).map(languageOf);
      if (!rows.length) continue;
      doc.languages = rows.map((r) => {
        const was = doc.languages.find((l) => same(l.language, r.language));
        return {
          ...(was || { id: uid('l') }),
          language: r.language,
          fluency: r.fluency || was?.fluency || '',
        };
      });
      done();
    } else if (key === 'certifications') {
      const names = lines(text);
      if (!names.length) continue;
      doc.certificates = names.map((name) => {
        const was = doc.certificates.find((x) => same(x.name, name));
        return was ? { ...was, name } : { id: uid('c'), name, date: '', issuer: '' };
      });
      done();
    } else {
      const m = /^experience\.(\d+)\.(title|bullets)$/.exec(key);
      const role = m ? doc.work[Number(m[1])] : null;
      if (!role) continue;
      if (m[2] === 'title') role.position = { text };
      else {
        const bullets = lines(text);
        if (!bullets.length) continue;
        role.highlights = bullets.map((b) => ({ id: uid('h'), text: b }));
      }
      done();
    }
  }
  return { cv: doc, applied };
}
