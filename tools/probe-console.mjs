// SPDX-License-Identifier: Apache-2.0
// `npm run probe:console`: a read-only probe to paste into DevTools on a page you are signed in
// to (LinkedIn, Indeed, APEC, Welcome to the Jungle), where probe:ats's throwaway browser can't
// follow.
//
// It writes dist/probe-console.js: the shipped engine and one function that describes and
// resolves every field on the page and prints a table of what a fill would do with each one:
// the key each field would take, or why it would be left alone. With no CV in it, whether there
// is an answer for that key (a language the CV holds, a bracket that fits) is not checked.
// It writes nothing into the page, clicks nothing, sends nothing anywhere, and holds no CV: the
// table has labels and decisions, never values. Paste the file's content into the DevTools
// console of the application page (open the form first), then read the table, or copy it with
// `copy(__epimoniProbe)`. A console paste runs under the DevTools' own rules rather than the
// page's script policy, which is why this works on sites a bookmarklet can't reach.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleContent } from './bundle.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dist', 'probe-console.js');

const RUN = `
  const resolver = createResolver({ lexicons: EPIMONI_PACKS, autocomplete: EPIMONI_AUTOCOMPLETE });
  const active = activeFillers(EPIMONI_FILLERS, document, location.href);
  const evidence = (el) =>
    active.flatMap((f) => {
      const got = f.describe ? f.describe(el) : null;
      return (Array.isArray(got) ? got : got ? [got] : []).map((text) => ({ kind: 'filler:' + f.id, text: String(text) }));
    });
  const owner = (el) => active.find((f) => f.match && f.match.widget && f.match.widget(el)) || null;
  const extra = active.flatMap((f) => (f.controls ? f.controls(document) : []));
  const els = fillableElements(document, extra);
  const bundles = els.map((el) => {
    const o = owner(el);
    const options = o && o.options ? o.options(el) : undefined;
    return labelBundle(el, { sources: evidence(el), options: Array.isArray(options) || options === true ? options : undefined });
  });
  const blocks = assignBlocks(els, resolver, els.map(() => null));
  els.forEach((_, i) => { bundles[i].block = blocks[i]; });
  const shown = (b) =>
    ((b.sources.find((s) => ['label', 'field-label', 'aria-label', 'aria-labelledby'].includes(s.kind)) ||
      b.sources.find((s) => s.kind === 'nearby' && s.weight >= 0.9) ||
      b.sources.find((s) => s.kind === 'legend') || b.sources[0] || {}).text || '').slice(0, 70);
  const row = (kind, b, d, by) => ({
    control: kind,
    question: shown(b),
    action: d.action,
    key: d.key ? (d.index != null ? d.key + '[' + d.index + ']' : d.key) : '',
    why: d.reason || '',
    by: by || '',
  });
  const rows = resolver
    .resolveAll(bundles)
    .map((d, i) => row(els[i].tagName.toLowerCase() + ':' + (els[i].type || els[i].getAttribute('role') || ''), bundles[i], d, owner(els[i]) && owner(els[i]).id));
  const files = fileInputs(document);
  const fileBundles = files.map((el) => labelBundle(el, { sources: evidence(el) }));
  resolver.resolveAll(fileBundles).forEach((d, i) => rows.push(row('file', fileBundles[i], d)));
  for (const group of radioGroups(document)) {
    const b = radioGroupBundle(group);
    rows.push(row('radio group', b, resolver.resolve(b)));
  }
  window.__epimoniProbe = rows;
  console.table(rows);
  return rows.length + ' fields read on ' + location.hostname + '. Nothing was written. copy(__epimoniProbe) puts the table on the clipboard.';
`;

await mkdir(join(ROOT, 'dist'), { recursive: true });
await writeFile(OUT, `(() => {\n${bundleContent(ROOT)}\n${RUN}\n})();\n`);
console.log(`wrote ${OUT}: paste it into the DevTools console of an open application form.`);
