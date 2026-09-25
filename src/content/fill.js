// SPDX-License-Identifier: Apache-2.0
// One fill of one page: scan, describe, resolve, write: with the fillers wired in.
//
// This is the whole engine short of the UI, so the content script and `test/measure.mjs` run
// the same code: what is measured is what ships. The content script adds the panel, the
// outlines and the telemetry around it.
//
// Fillers (`src/fillers/`) join at four points and decide nothing:
//
//   scan      controls(root)    custom controls the native scan cannot see
//   describe  describe(el)      label evidence, weighed by the core like any other source
//   blocks    hint(el)          which entry of which section, checked against the page's own
//   write     options / write   a custom dropdown's answers, and how to pick one: through the
//                               guarded API in guard.js, never directly
//
// The resolver in between is the same one every other field goes through, with the same
// thresholds, `not` lists and shape rules. That is the safety argument for accepting fillers
// from anybody: a filler can add evidence and it can operate a widget, but it cannot make the
// engine answer a question the evidence does not support.

import {
  assignBlocks,
  clearValue,
  fillableElements,
  hasUserValue,
  labelBundle,
  matchOption,
  radioAnswered,
  radioGroupBundle,
  radioGroups,
  setRadio,
  setValue,
  valueFor,
} from './dom.js';
import { createGuard } from './guard.js';

/** Run a filler hook; a filler that throws contributes nothing rather than stopping the fill. */
function safely(errors, filler, hook, fn) {
  try {
    return fn();
  } catch (e) {
    errors.push(`${filler.id}.${hook}: ${e?.message || e}`);
    return undefined;
  }
}

/** Does a host pattern (`example.com`, `*.example.com`) cover this hostname? */
export function hostMatches(pattern, host) {
  const p = String(pattern || '').toLowerCase();
  const h = String(host || '').toLowerCase();
  if (p.startsWith('*.')) return h === p.slice(2) || h.endsWith(p.slice(1));
  return h === p;
}

/**
 * The fillers that apply to this page: every widget filler, and the site fillers whose hosts
 * match or whose `probe` recognises the document. A probe matters for sites served on
 * customers' own domains: an ATS embedded under a company's careers page.
 */
export function activeFillers(fillers, doc, url, errors = []) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {}
  return (fillers || []).filter((f) => {
    if (f.kind === 'widget') return true;
    if ((f.match?.hosts || []).some((p) => hostMatches(p, host))) return true;
    return Boolean(f.match?.probe && safely(errors, f, 'probe', () => f.match.probe(doc)));
  });
}

/**
 * Write one value, the way the owning filler says or the native way.
 *
 * Returns `{ok, undo}`. The panel's "accept" button uses this too, so an accepted suggestion
 * on a custom dropdown is written exactly as a fill would be.
 */
export async function writeOne(el, value, owner, errors = []) {
  if (owner?.write) {
    const api = createGuard(el, { setValue, clearValue, matchOption });
    let res;
    try {
      res = await owner.write(el, value, api);
    } catch (e) {
      errors.push(`${owner.id}.write: ${e?.message || e}`);
      return { ok: false };
    }
    if (api.refusals.length) errors.push(...api.refusals.map((r) => `${owner.id}: refused ${r}`));
    const ok = res === true || res?.ok === true;
    if (ok) el.setAttribute('data-epimoni-filled', '1');
    const undo = typeof res?.undo === 'function' ? res.undo : null;
    return { ok, undo };
  }
  return { ok: setValue(el, value), undo: null };
}

/**
 * Fill a page. Returns everything the caller needs to report and to undo:
 *
 * - `filled`       `{el, key, index, value, via, undo}` written
 * - `suggestions`  `{el, key, index, value, owner}` offered, not written
 * - `rows`         one per control, for measurement: decision, bundle, what was written
 * - `ai`, `unknown`, `ongoing`, `radios` counts; `blocks`; `fillers` (ids); `errors`
 */
export async function runFill({
  root = document,
  url = '',
  profile = {},
  entries = {},
  resolver,
  fillers = [],
}) {
  const errors = [];
  const doc = root.ownerDocument || root;
  const active = activeFillers(fillers, doc, url, errors);

  const extra = active.flatMap(
    (f) => (f.controls && safely(errors, f, 'controls', () => f.controls(root))) || [],
  );
  const found = fillableElements(root, [...extra]);
  const claim = (el) =>
    active.find((f) => f.match?.widget && safely(errors, f, 'match', () => f.match.widget(el))) || null;
  const claimed = found.map(claim);
  // A widget's own inner input (React-Select renders one inside the combobox) is part of the
  // widget, not a second question: left to the filler that owns the widget.
  const widgets = found.filter((_, i) => claimed[i]);
  const keep = found.map((el) => !widgets.some((w) => w !== el && w.contains(el)));
  const els = found.filter((_, i) => keep[i]);
  const owners = claimed.filter((_, i) => keep[i]);
  const bundles = els.map((el, i) => {
    const sources = active.flatMap((f) => {
      if (!f.describe) return [];
      const got = safely(errors, f, 'describe', () => f.describe(el));
      return (Array.isArray(got) ? got : got ? [got] : []).map((text) => ({
        kind: `filler:${f.id}`,
        text: String(text),
      }));
    });
    const owner = owners[i];
    // `options` is the answers a custom dropdown offers, or `true` for a closed list whose
    // answers only exist once it is opened: the filler then picks with `api.pick`.
    const options = owner?.options ? safely(errors, owner, 'options', () => owner.options(el)) : undefined;
    return labelBundle(el, {
      sources,
      options: Array.isArray(options) || options === true ? options : undefined,
    });
  });
  const hints = els.map((el) => {
    for (const f of active) {
      if (!f.hint) continue;
      const h = safely(errors, f, 'hint', () => f.hint(el));
      if (h) return { ...h, via: `filler:${f.id}` };
    }
    return null;
  });
  // Which entry of which CV section each control belongs to, decided for the page as a whole:
  // an index only means something against the other blocks around it.
  const blocks = assignBlocks(els, resolver, hints);
  els.forEach((_, i) => {
    bundles[i].block = blocks[i];
  });
  const decisions = resolver.resolveAll(bundles);

  const filled = [];
  const suggestions = [];
  const rows = [];
  let ai = 0;
  let unknown = 0;
  let ongoing = 0;

  // Sequential on purpose: a widget filler opens a popup, and two open at once is how an
  // option gets picked in the wrong list.
  for (const [i, el] of els.entries()) {
    const d = decisions[i];
    const owner = owners[i];
    const row = { el, decision: d, bundle: bundles[i], owner: owner?.id || null, wrote: null };
    rows.push(row);
    if (d.action === 'ai-candidate') {
      ai += 1;
      continue;
    }
    if (d.action !== 'fill' && d.action !== 'suggest') {
      unknown += 1;
      continue;
    }
    const got = valueFor(d, el, bundles[i], profile, entries);
    if (!got) continue; // recognised, nothing to put there
    if (got.ongoing) {
      // The end date of a role still in progress stays empty. The "poste actuel" box beside
      // it is a checkbox, which this extension never ticks, so the panel says so instead.
      ongoing += 1;
      continue;
    }
    const answered = owner?.answered
      ? safely(errors, owner, 'answered', () => owner.answered(el))
      : hasUserValue(el);
    if (answered) continue; // never overwrite what the user typed
    const tooLong = got.value && el.maxLength > 0 && got.value.length > el.maxLength;
    if (d.action === 'suggest' || got.suggest || tooLong) {
      // The resolver named a key but would not commit, or the value itself needs a human: a
      // day nobody wrote down, a description longer than the field. Offered, never truncated:
      // a cut sentence submitted in somebody's name is worse than an empty field.
      suggestions.push({ el, key: d.key, index: d.index, value: got.suggest || got.value, owner });
      continue;
    }
    const { ok, undo } = await writeOne(el, got.value, owner, errors);
    if (!ok) continue; // a <select> or a dropdown with no matching option
    row.wrote = { key: d.key, index: d.index, value: got.value };
    filled.push({ el, key: d.key, index: d.index, value: got.value, via: d.via, undo });
  }

  // Radio groups, resolved as whole questions rather than as individual options.
  // Checkboxes are never touched: see radioGroups() in dom.js for why.
  let radios = 0;
  const radioRows = [];
  for (const group of radioGroups(root)) {
    const d = resolver.resolve(radioGroupBundle(group));
    const rrow = { group, decision: d, chosen: null };
    radioRows.push(rrow);
    if (radioAnswered(group) || d.action !== 'fill') continue;
    const value = profile[d.key];
    if (value === undefined) continue;
    const chosen = setRadio(group, value);
    if (!chosen) continue;
    rrow.chosen = chosen;
    filled.push({ el: chosen, key: d.key, value, via: d.via, radio: true, undo: null });
    radios += 1;
  }

  return {
    els,
    rows,
    radioRows,
    filled,
    suggestions,
    ai,
    unknown,
    ongoing,
    radios,
    blocks,
    fillers: active.map((f) => f.id),
    errors,
  };
}
