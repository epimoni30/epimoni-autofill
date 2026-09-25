// Phase A0: does a job posting give us enough to analyse, and from where?
//
// `npm run probe`: reconnaissance, not a test. It visits a real posting on each Tier-1
// board and reports what an extraction would have to work with, so the extraction module is
// written against measured pages rather than an assumption about them.
//
// The two questions it answers per board:
//   1. Is there a schema.org JobPosting in the DOM? Every board that wants to appear in
//      Google for Jobs must publish one, which would make extraction exact rather than
//      heuristic. But `curl` sees it on HelloWork and not on APEC or Welcome to the Jungle,
//      because those two render client-side, so the question can only be answered in a
//      real DOM, which is also where the content script runs.
//   2. Failing that, how much advert text does a main/article heuristic recover?
//
// Runs in a throwaway browser profile: none of the operator's cookies, sessions or history
// are touched, and consent state does not persist between runs.

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadChromium } from './chromium.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Captures land in an ignored directory: they are whole pages from other people's sites,
// kept for local work and never redistributed. The committed fixtures beside them are
// reconstructions: see test/posting.test.mjs.
const OUT = join(ROOT, 'test/fixtures/postings/.private');
const chromium = await loadChromium();

// A search page per board plus the shape of a detail link on it. Search first rather than a
// hardcoded posting URL, because adverts are taken down and a probe that 404s months from now
// reports a broken board instead of a stale link.
const BOARDS = [
  {
    name: 'france-travail',
    search: 'https://candidat.francetravail.fr/offres/recherche?motsCles=d%C3%A9veloppeur',
    detail: /\/offres\/recherche\/detail\/[A-Z0-9]+/,
  },
  {
    name: 'hellowork',
    search: 'https://www.hellowork.com/fr-fr/emploi/recherche.html?k=developpeur',
    detail: /\/fr-fr\/emplois\/[0-9A-Za-z_.-]+\.html/,
  },
  {
    name: 'apec',
    search: 'https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=developpeur',
    detail: /\/candidat\/recherche-emploi\.html\/emploi\/detail-offre\/[0-9A-Za-z-]+/,
  },
  {
    name: 'welcometothejungle',
    search: 'https://www.welcometothejungle.com/fr/jobs?query=developpeur',
    detail: /\/companies\/[^/"]+\/jobs\/[^/"?]+/,
  },
  {
    name: 'indeed',
    search: 'https://fr.indeed.com/jobs?q=developpeur',
    detail: /\/(viewjob\?jk=|rc\/clk\?jk=)[0-9a-f]+/,
  },
  {
    name: 'linkedin',
    search: 'https://www.linkedin.com/jobs/search?keywords=developpeur&location=France',
    detail: /\/jobs\/view\/[0-9]+/,
  },
];

/**
 * What an extraction would see. Runs in the page, so it reads the rendered DOM (the same
 * thing the content script gets) rather than the server's HTML.
 */
const PROBE = () => {
  const out = { jsonld: null, blocks: 0, heuristic: null, bodyWords: 0 };
  const words = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length;

  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
  out.blocks = scripts.length;
  const flatten = (node, sink) => {
    if (Array.isArray(node)) {
      for (const n of node) flatten(n, sink);
      return;
    }
    if (!node || typeof node !== 'object') return;
    sink.push(node);
    if (node['@graph']) flatten(node['@graph'], sink);
  };
  const nodes = [];
  for (const s of scripts) {
    try {
      flatten(JSON.parse(s.textContent), nodes);
    } catch {
      /* a malformed block is a finding, not a crash */
    }
  }
  const posting = nodes.find((n) => {
    const t = n['@type'];
    return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
  });
  if (posting) {
    out.jsonld = {
      title: posting.title || null,
      descriptionWords: words(String(posting.description || '').replace(/<[^>]+>/g, ' ')),
      hiringOrganization: posting.hiringOrganization?.name || posting.hiringOrganization || null,
      hasSalary: !!posting.baseSalary,
      hasLocation: !!posting.jobLocation,
      datePosted: posting.datePosted || null,
    };
  }

  // The fallback: the largest plausible advert container. Deliberately crude: the point is
  // to learn whether a crude rule is already enough, not to ship this exact selector.
  const candidates = [
    ...document.querySelectorAll('main, article, [role="main"], #jobDescriptionText, .job-description'),
  ];
  let best = null;
  for (const el of candidates) {
    const clone = el.cloneNode(true);
    for (const n of clone.querySelectorAll('nav, header, footer, script, style, noscript, aside')) n.remove();
    const w = words(clone.innerText);
    if (!best || w > best.words)
      best = { words: w, tag: el.tagName.toLowerCase(), cls: el.className?.toString().slice(0, 40) || '' };
  }
  out.heuristic = best;
  out.bodyWords = words(document.body.innerText);
  return out;
};

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
const results = [];

for (const board of BOARDS) {
  const row = { board: board.name, stage: 'search', url: board.search };
  const context = await browser.newContext({
    locale: 'fr-FR',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  try {
    await page.goto(board.search, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3500); // client-rendered boards need a beat

    // Find a detail link in the rendered DOM.
    const href = await page.evaluate((src) => {
      const re = new RegExp(src);
      const hit = [...document.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href'))
        .find((h) => h && re.test(h));
      return hit || null;
    }, board.detail.source);

    if (!href) {
      row.result = 'no detail link found on the search page';
      results.push(row);
      await context.close();
      continue;
    }
    const url = new URL(href, board.search).toString();
    row.stage = 'detail';
    row.url = url;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3500);

    Object.assign(row, await page.evaluate(PROBE));
    await writeFile(join(OUT, `${board.name}.html`), await page.content());
  } catch (e) {
    row.result = `error: ${String(e.message || e)
      .split('\n')[0]
      .slice(0, 120)}`;
  }
  results.push(row);
  await context.close();
}
await browser.close();

const pad = (s, n) => String(s ?? '').padEnd(n);
console.log(
  '\n' +
    pad('board', 22) +
    pad('ld+json', 9) +
    pad('JobPosting', 12) +
    pad('descr.words', 13) +
    pad('heuristic', 11) +
    'note',
);
console.log('─'.repeat(100));
for (const r of results) {
  console.log(
    pad(r.board, 22) +
      pad(r.blocks ?? '·', 9) +
      pad(r.jsonld ? 'YES' : r.result ? '·' : 'no', 12) +
      pad(r.jsonld ? r.jsonld.descriptionWords : '·', 13) +
      pad(r.heuristic ? `${r.heuristic.words}w` : '·', 11) +
      (r.result ||
        (r.jsonld
          ? `${r.jsonld.hiringOrganization || ''}${r.jsonld.hasSalary ? ' · salary' : ''}`
          : `body ${r.bodyWords}w`)),
  );
}
await writeFile(join(OUT, 'probe.json'), JSON.stringify(results, null, 2));
console.log(`\nfixtures + probe.json written to test/fixtures/postings/`);
