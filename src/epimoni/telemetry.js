// Telemetry, on the editor's model: four event names, the verb in `meta.what` against a
// closed vocabulary the backend validates (it answers 400 to an unknown verb rather than
// bucketing it as "other"). One name per button would mean a
// backend deploy every time the UI grows one.
//
// Three invariants, same as the editor's: no field values and no document text ever leave
// the machine; counts and decisions only; and telemetry never breaks the surface: every
// failure here is swallowed.

import { API } from './api.js';
import { USAGE_DATA, consented } from './consent.js';

export const EVENTS = ['ext_paired', 'ext_fill', 'ext_seen', 'ext_session_end'];
export const WHAT = [
  'fill_run',
  'field_accepted',
  'field_rejected',
  'adapter_hit',
  'heuristic_hit',
  'unknown_field',
  'letter_generated',
  'answers_generated',
  'paywall_shown',
  'handoff_site',
];

const MAX_EVENTS = 80;
const MAX_PER_WHAT = 10;
const BUDGET_KEY = 'telemetry_budget';

/**
 * Budgets live in `chrome.storage.session`, not in module scope.
 *
 * An MV3 service worker is terminated after ~30 seconds idle and restarted on the next
 * event, which resets every module-level variable. Counters kept in a `let` therefore cap
 * nothing: each wake starts from zero and a runaway loop would send without limit.
 * `storage.session` is in-memory and cleared when the browser closes, which is exactly the
 * lifetime a per-session budget wants.
 */
async function claimBudget(what) {
  try {
    const bag = await chrome.storage.session.get(BUDGET_KEY);
    const budget = bag[BUDGET_KEY] || { sent: 0, perWhat: {} };
    if (budget.sent >= MAX_EVENTS) return false;
    if (what) {
      const n = (budget.perWhat[what] || 0) + 1;
      if (n > MAX_PER_WHAT) return false;
      budget.perWhat[what] = n;
    }
    budget.sent += 1;
    await chrome.storage.session.set({ [BUDGET_KEY]: budget });
    return true;
  } catch {
    // No session storage (or it threw): send nothing. A budget that cannot be counted is not
    // a budget, and losing a usage event is cheaper than an uncapped stream of them.
    return false;
  }
}

// What a page's report may carry, and in what shape. The content script runs inside the page,
// so the worker does not take its word that a report holds no value: anything not named here,
// a number that is not a count, a string that is not an identifier, is dropped. A CV value
// cannot pass as a key name ("camille.dupont@example.org" fails on `@`, a sentence on its
// spaces).
const COUNTS = [
  'controls',
  'filled',
  'suggested',
  'ai_candidates',
  'unknown',
  'radios',
  'files',
  'by_label',
  'blocks',
  'leftover',
  'refill',
  'accepted',
  'rejected',
  'unanswered',
];
const NAMES = ['key', 'keys', 'fillers'];
const NAME_LIST = /^[a-z][a-z0-9_.-]*(,[a-z][a-z0-9_.-]*)*$/;

/**
 * A report from a content script, reduced to counts and field names, with `host` taken from
 * the address the browser says the sender is on rather than from the report.
 */
export function pageMeta(meta, senderUrl) {
  const out = {};
  if (!meta || typeof meta !== 'object') return out;
  if (WHAT.includes(meta.what)) out.what = meta.what;
  for (const k of COUNTS) {
    const v = meta[k];
    if (Number.isInteger(v) && v >= 0 && v < 100000) out[k] = v;
  }
  for (const k of NAMES) {
    const v = meta[k];
    if (typeof v === 'string' && v.length <= 600 && (v === '' || NAME_LIST.test(v))) out[k] = v;
  }
  try {
    const host = new URL(senderUrl).hostname;
    if (host) out.host = host;
  } catch {}
  return out;
}

/**
 * `host` is the dimension worth having: it tells us which sites we fail on. The posting
 * text, the labels and the values are not, and must never be attached.
 */
export async function track(jwt, name, meta = {}) {
  if (!jwt || !EVENTS.includes(name)) return;
  if (meta.what && !WHAT.includes(meta.what)) return;
  // Where the browser asks (Firefox), usage events are opt-in and nothing asks for them yet:
  // they stay off there until the user grants them.
  if (!(await consented(USAGE_DATA))) return;
  if (!(await claimBudget(meta.what))) return;
  try {
    await fetch(`${API}/api/v1/events`, {
      method: 'POST',
      headers: { 'Content-type': 'application/json', 'Access-Token': jwt },
      body: JSON.stringify({ name, meta }),
      keepalive: true,
    });
  } catch {
    /* never surface a telemetry failure */
  }
}
