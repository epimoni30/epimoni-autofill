// Reading the job advert off the page.
//
// Two sources, and the order between them is measured rather than assumed
// (`tools/probe-postings.mjs`, 2026-09-19):
//
//   France Travail  no JobPosting JSON-LD at all   · main#contents  1009 words
//   HelloWork       JobPosting, 725-word description · main           538 words
//
// The board the product is built around publishes no structured data, so **the heuristic is
// the primary path and JSON-LD is enrichment**: the reverse of the obvious design. Where a
// board does publish a JobPosting, its `description` is still the better body: it is the
// advert without the navigation, the "postuler" buttons and the related-offers rail that a
// container heuristic inevitably sweeps in.
//
// `chooseSource` is deliberately pure (it takes two strings and returns the decision) so
// the part that decides what gets sent to a paid model is testable without a browser, the
// same split `resolve.js` has against `dom.js`.

// Below this an "advert" is a cookie banner, a login wall or a spinner. 40 words is the
// site's own floor for a pasted offer, and using the same number means the extension and the site
// refuse the same inputs.
const MIN_WORDS = 40;

// The backend refuses a prompt over its token budget with a 422. The
// advert is the smaller half of that prompt (the CV is the other) so this is a guard
// against a page that turned out to be a whole careers site, not a tuned limit.
const MAX_CHARS = 20000;

const words = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length;

/** Collapse the whitespace a DOM read produces without joining separate lines into one. */
function tidy(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

/**
 * Drop lines the page repeats.
 *
 * France Travail states the job title on the heading, on the apply button, on the print
 * link and on the locate link, so a container read yields it four times before the advert
 * starts. Deduplicating *identical* lines removes that without a per-board list of button
 * labels, which would be an adapter by another name, and adapters are the thing this
 * product is deliberately not accumulating.
 *
 * Only short lines are deduplicated: two identical paragraphs are a formatting quirk of the
 * advert and belong to the author, but two identical five-word lines are furniture.
 */
function dropRepeatedLines(text) {
  const seen = new Set();
  return text
    .split('\n')
    .filter((line) => {
      const key = line.toLowerCase();
      if (!key) return true;
      if (words(line) > 8) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n');
}

/** A JobPosting `description` is HTML in every board that publishes one. */
function htmlToText(html) {
  return tidy(
    String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&[a-z]+;/gi, ' '),
  );
}

/**
 * Every schema.org node on the page, flattened.
 *
 * `@graph` is walked because several boards publish one block holding the whole page graph
 * rather than a block per entity, and a malformed block is skipped rather than thrown on:
 * one board shipping broken JSON must not cost us the other source.
 */
export function jsonLdNodes(root = document) {
  const nodes = [];
  const flatten = (node) => {
    if (Array.isArray(node)) {
      node.forEach(flatten);
      return;
    }
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    if (node['@graph']) flatten(node['@graph']);
  };
  for (const el of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      flatten(JSON.parse(el.textContent));
    } catch {
      /* a broken block is not a page failure */
    }
  }
  return nodes;
}

const isType = (node, type) => {
  const t = node?.['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
};

const nameOf = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? v.name || '' : '');

/** The JobPosting facts worth putting in front of the advert body, when a board gives them. */
export function jsonLdPosting(root = document) {
  const posting = jsonLdNodes(root).find((n) => isType(n, 'JobPosting'));
  if (!posting) return null;
  const place = posting.jobLocation;
  const address = (Array.isArray(place) ? place[0] : place)?.address;
  // A salary line is only worth writing when there is a *number* in it. HelloWork publishes a
  // `baseSalary` whose value carries a currency and no amount, which rendered as the wonderfully
  // useless "Rémunération : EUR": a line that costs prompt tokens and says nothing.
  const pay = posting.baseSalary?.value;
  const amounts = [pay?.minValue ?? pay?.value, pay?.maxValue].filter(
    (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''),
  );
  const salary = amounts.length
    ? tidy(
        `${amounts.join('–')} ${posting.baseSalary.currency || ''}${pay.unitText ? ` / ${pay.unitText}` : ''}`,
      )
    : '';

  return {
    title: tidy(posting.title),
    organisation: tidy(nameOf(posting.hiringOrganization)),
    location: tidy([address?.addressLocality, address?.addressRegion].filter(Boolean).join(', ')),
    employmentType: tidy(
      Array.isArray(posting.employmentType) ? posting.employmentType.join(', ') : posting.employmentType,
    ),
    salary,
    description: htmlToText(posting.description),
  };
}

/**
 * The advert container, by heuristic.
 *
 * `main` carries it on both measured boards. The clone is stripped before reading because
 * `innerText` on a live `main` includes the header, the apply rail and the related-offers
 * list: on France Travail that is the difference between the advert and the whole page.
 */
export function heuristicText(root = document) {
  const SELECTORS = [
    'main',
    'article',
    '[role="main"]',
    '#jobDescriptionText',
    '.job-description',
    '.offer-description',
  ];
  const STRIP =
    'nav, header, footer, aside, script, style, noscript, form, button, [role="navigation"], [aria-hidden="true"]';
  let best = '';
  for (const selector of SELECTORS) {
    for (const el of root.querySelectorAll(selector)) {
      const clone = el.cloneNode(true);
      for (const n of clone.querySelectorAll(STRIP)) n.remove();
      // `innerText` needs layout, which a detached clone does not have, so the clone is read
      // through `textContent` with block tags turned into breaks first.
      for (const n of clone.querySelectorAll('p, div, li, br, h1, h2, h3, h4, tr')) n.append('\n');
      const text = dropRepeatedLines(tidy(clone.textContent));
      if (words(text) > words(best)) best = text;
    }
  }
  // Nothing matched: some ATS pages are a bare div soup. The body is a poor advert but a
  // real one, and the floor below is what refuses it if it is not.
  if (!best && root.body) best = tidy(root.body.textContent);
  return best;
}

/**
 * Which source to send, given both. Pure.
 *
 * JSON-LD wins when it is substantial, because it is the advert without the page furniture.
 * It loses when a board publishes a stub `description` (a teaser, or the title repeated),
 * which is why this compares the two rather than preferring one unconditionally.
 */
export function chooseSource(jsonLdText, heuristic) {
  const a = words(jsonLdText);
  const b = words(heuristic);
  if (a >= MIN_WORDS && a >= b * 0.6) return { text: jsonLdText, via: 'json-ld', words: a };
  if (b >= MIN_WORDS) return { text: heuristic, via: 'heuristic', words: b };
  // Neither is usable. Report the better of the two so the panel can say how short it was.
  return { text: '', via: 'none', words: Math.max(a, b) };
}

/**
 * The advert as it will be sent for analysis, or a refusal.
 *
 * Refusing is a real outcome, not an error: a cookie wall, a login page or a listing page
 * all produce text, and analysing one of them would spend a metered call to compare the CV
 * against a cookie policy.
 */
export function extractPosting(root = document, url = '') {
  const facts = jsonLdPosting(root);
  const chosen = chooseSource(facts?.description || '', heuristicText(root));
  if (!chosen.text) {
    return { ok: false, reason: 'too-short', words: chosen.words, minWords: MIN_WORDS };
  }

  // The facts go in front of the body rather than replacing any of it: a salary or a contract
  // type stated only in the structured data is exactly what the comparison should see, and on
  // a board with no JSON-LD this header is simply absent.
  const header = facts
    ? [
        facts.title && `Intitulé : ${facts.title}`,
        facts.organisation && `Entreprise : ${facts.organisation}`,
        facts.location && `Lieu : ${facts.location}`,
        facts.employmentType && `Contrat : ${facts.employmentType}`,
        facts.salary && `Rémunération : ${facts.salary}`,
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const text = [header, chosen.text].filter(Boolean).join('\n\n').slice(0, MAX_CHARS);
  return {
    ok: true,
    text,
    via: chosen.via,
    words: words(text),
    truncated: header.length + chosen.text.length > MAX_CHARS,
    title: facts?.title || tidy(root.title || ''),
    organisation: facts?.organisation || '',
    url,
  };
}
