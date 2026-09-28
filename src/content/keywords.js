// SPDX-License-Identifier: Apache-2.0
// Which of the CV's skills the advert on screen names, and where.
//
// Part of the free core: no model, no network, nothing leaves the page. It is a plain match
// of what the CV says against what the advert says, which is exactly as much as it claims to
// be. The judgement of fit (which requirement is missing, how much it matters) is the paid
// analysis; this only answers "did they ask for what I listed?", in a line, on every advert.
//
// Highlighting uses the CSS Custom Highlight API: ranges over the page's own text nodes, drawn
// by the browser. Nothing is wrapped in a <mark> and no node is added or moved, so a React
// page cannot lose its state over it, and turning it off leaves the document as it was.

const HIGHLIGHT = 'epimoni-skill';
// The advert's container, most specific first; the body when nothing names one.
const CONTAINERS = [
  '#jobDescriptionText',
  '.job-description',
  '.offer-description',
  'article',
  'main',
  '[role="main"]',
];
const SKIP =
  'script, style, noscript, form, nav, header, footer, button, textarea, input, select, #epimoni-panel';

/**
 * The CV's skill terms, from the entries a form is filled from: every skill and its keywords,
 * each language, each certificate. Deduplicated without regard to case; a single character
 * is dropped, since it would match everywhere.
 */
export function skillTerms(entries = {}) {
  const raw = [
    ...(entries.skills || []).flatMap((s) => [s?.name, ...String(s?.keywords || '').split(/\s*[,;·]\s*/)]),
    ...(entries.languages || []).map((l) => l?.language),
    ...(entries.certificates || []).map((c) => c?.name),
  ];
  const seen = new Map();
  for (const v of raw) {
    const term = String(v || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (term.length < 2 || term.length > 60) continue;
    const key = term.toLocaleLowerCase();
    if (!seen.has(key)) seen.set(key, term);
  }
  return [...seen.values()];
}

/**
 * A term as a whole-word pattern. Short terms ("SEO", "SQL", "Go") are matched with their
 * case, because in lower case they are ordinary words ("go", "sql" aside, "it", "ai"); longer
 * ones without it. Letters and digits either side end a word, in any script.
 */
export function termPattern(term) {
  const body = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, term.length <= 3 ? 'gu' : 'giu');
}

/** Split terms into those the text names and those it does not. Pure. */
export function mentions(terms, text) {
  const found = [];
  const missing = [];
  for (const term of terms) (termPattern(term).test(text) ? found : missing).push(term);
  return { found, missing };
}

/** The element holding the advert: the richest known container, else the body. */
function advertRoot(doc) {
  let best = null;
  let words = 0;
  for (const sel of CONTAINERS)
    for (const el of doc.querySelectorAll(sel)) {
      const n = (el.textContent || '').split(/\s+/).length;
      if (n > words) {
        best = el;
        words = n;
      }
    }
  return best || doc.body;
}

/**
 * Draw the found terms over the advert, or clear them with an empty list. Returns how many
 * places were marked. A browser without the API draws nothing and says so with 0.
 */
export function highlightTerms(terms, doc = document) {
  const view = doc.defaultView;
  if (!view?.CSS?.highlights || typeof view.Highlight !== 'function') return 0;
  view.CSS.highlights.delete(HIGHLIGHT);
  if (!terms.length) return 0;
  if (!doc.getElementById('epimoni-highlight-style')) {
    const style = doc.createElement('style');
    style.id = 'epimoni-highlight-style';
    style.textContent = `::highlight(${HIGHLIGHT}) { background-color: rgba(124, 92, 255, 0.28); color: inherit; }`;
    doc.documentElement.appendChild(style);
  }
  const patterns = terms.map(termPattern);
  const ranges = [];
  const walker = doc.createTreeWalker(advertRoot(doc), view.NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest(SKIP) || !n.nodeValue.trim()
        ? view.NodeFilter.FILTER_REJECT
        : view.NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const re of patterns) {
      re.lastIndex = 0;
      for (const m of node.nodeValue.matchAll(re)) {
        const r = doc.createRange();
        r.setStart(node, m.index);
        r.setEnd(node, m.index + m[0].length);
        ranges.push(r);
      }
    }
  }
  if (ranges.length) view.CSS.highlights.set(HIGHLIGHT, new view.Highlight(...ranges));
  return ranges.length;
}
