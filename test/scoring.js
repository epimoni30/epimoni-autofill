// SPDX-License-Identifier: Apache-2.0
// How a fill is scored against a fixture's ground truth: shared by `test/measure.mjs` (the CI
// gate) and the playground (the same measurement, run in a visitor's browser). One copy, so the
// number a visitor sees is the number CI enforces.
//
// Browser-safe on purpose: no Node imports. The playground loads this file as it is.

/**
 * The extras a form needs and the CV does not hold: in the extension they are typed once and
 * kept in chrome.storage.local. The measurement and the playground's sample CV both use these.
 */
export const SAMPLE_EXTRAS = {
  postal_code: '44000',
  street: '12 rue du Calvaire',
  country: 'France',
  // Stored as the user typed it. A radio group offering "Oui"/"Non" still resolves, because
  // matching falls back from exact to prefix.
  work_authorization: 'Oui, ressortissant UE',
};

/**
 * The in-page runner, as source. It runs inside the fixture's frame, after the engine bundle,
 * with `profile` and `entries` in scope, and returns a promise of one row per `[data-expect]`
 * control, in document order (`i`): what the engine decided and what it wrote.
 */
export const RUNNER_BODY = `
  // A scoped decision is reported the way fixtures annotate it: \`work[1].company\`.
  const named = (d) => d.key && d.index != null ? d.key.replace('.', '[' + d.index + '].') : d.key || null;
  // Ground truth first, including controls the engine will (correctly) never offer to
  // fill, so a skipped password field still counts as a pass rather than vanishing.
  const truth = deepQueryAll(document, '[data-expect]');
  // The engine the content script runs, fillers included: \`runFill\` in src/content/fill.js.
  return runFill({ root: document, url: location.href, profile, entries, resolver: __resolver, fillers: EPIMONI_FILLERS })
    .then((run) => {
  if (run.errors.length) console.warn('filler errors', run.errors);
  const outcome = new Map();
  for (const r of run.rows) {
    const d = r.decision;
    outcome.set(r.el, { action: d.action, key: named(d), reason: d.reason || null,
                        wroteKey: r.wrote ? named(d) : null, wroteValue: r.wrote ? r.wrote.value : null,
                        label: (r.bundle.sources[0] || {}).text || '', owner: r.owner });
  }
  // Radio groups are resolved as whole questions; checkboxes are never offered at all, so any
  // checkbox in a fixture is scored on having been left alone.
  for (const { group, decision: d, chosen } of run.radioRows) {
    const label = (radioGroupBundle(group).sources[0] || {}).text || '';
    for (const r of group.inputs)
      if (!outcome.has(r)) outcome.set(r, { action: d.action, key: d.key || null, reason: d.reason || null, wroteKey: null, wroteValue: null, label });
    if (chosen) outcome.set(chosen, { action: d.action, key: d.key, reason: null, wroteKey: d.key, wroteValue: profile[d.key], label });
  }
  return truth.map((el, i) => {
    const o = outcome.get(el) || { action: 'not-offered', key: null, reason: 'filtered', wroteKey: null, wroteValue: null, label: '' };
    const key = el.name || el.id || el.getAttribute('data-state');
    // For a React-controlled field, the DOM value is not the answer: the component state is.
    const controlled = el.hasAttribute('data-controlled');
    const state = controlled ? (window.__state || {})[key] : undefined;
    // A controlled radio stores the option's own value, not the profile text that selected
    // it: "Oui, ressortissant UE" legitimately picks the option whose value is "oui".
    // A select is the same: it stores the chosen option's value, which "langue maternelle"
    // selects as "Langue maternelle".
    const isRadio = el.type === 'radio';
    const expectedState = isRadio || el.tagName === 'SELECT' ? el.value : o.wroteValue;
    return { i, expect: el.getAttribute('data-expect'), ...o, controlled,
             stateOk: !controlled || o.wroteValue === null ? null : state === expectedState,
             domValue: el.tagName === 'SELECT' ? el.value : String(el.value || '') };
  });
    });
`;

/**
 * One row's verdict. The order matters: a write where the truth says "none" is wrong however
 * it happened, and a key the engine named correctly with nothing in the CV to put there is
 * `nodata`: the CV's gap, not the engine's.
 */
export function verdictOf(r) {
  if (r.expect === 'none') return r.wroteKey ? 'wrong' : 'ok';
  if (r.expect === 'ai-candidate')
    return r.wroteKey ? 'wrong' : r.action === 'ai-candidate' ? 'ai' : 'aiMiss';
  if (r.wroteKey === r.expect) return r.stateOk === false ? 'wrong' : 'hit';
  if (r.wroteKey) return 'wrong';
  if (r.action === 'fill' && r.key === r.expect) return 'nodata';
  return r.action === 'suggest' || r.action === 'ai-candidate' ? 'soft' : 'miss';
}

export const VERDICTS = ['hit', 'wrong', 'miss', 'soft', 'ok', 'ai', 'aiMiss', 'nodata'];

/** Count verdicts, plus the fill rate over the fields that were there to fill. */
export function tally(rows) {
  const t = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  for (const r of rows) t[verdictOf(r)] += 1;
  const fillable = t.hit + t.wrong + t.miss + t.soft;
  t.fillable = fillable;
  t.pct = fillable ? Math.round((t.hit / fillable) * 100) : 100;
  return t;
}
