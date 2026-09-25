// The vitrine-side hand-off, standalone so it can be pasted into a console on
// epimoni30.com to pair a development build. Phase 2 moves this into
// UserPreferencesDialog.tsx; the message shape is the contract either way (docs/pairing.md).
//
// It deliberately builds the profile here rather than asking the extension to fetch one:
// see docs/pairing.md for the measurements behind that.

(async (EXTENSION_ID) => {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user?.jwt) throw new Error('not signed in on epimoni30.com');

  // A CvDoc field may be a string, a {text} wrapper, or a legacy {diff:{tokens}} block:
  // including a reverted one, which reads as the original. Mirrors
  // `fieldCurrent` in src/shared/cvdoc.js.
  const tok = (t, drop) => t.filter((x) => x && x.t !== drop).map((x) => x.s).join('');
  const f = (v) => !v ? '' : typeof v === 'string' ? v.trim()
    : v.text != null ? String(v.text).trim()
    : v.diff ? tok(v.diff.tokens || [], v.diff.reverted ? 'add' : 'del').trim() : '';

  // The local draft is `{cv, builderId, title}` on the live site; the
  // other two shapes are older saves. Try all three rather than assume one.
  const draft = JSON.parse(localStorage.getItem('epimoni_cv_builder_draft') || 'null');
  const cv = draft?.cv?.basics ? draft.cv : draft?.content?.basics ? draft.content : draft?.basics ? draft : null;
  if (!cv?.basics) throw new Error('no CV found in this browser, open the editor first');

  const b = cv.basics || {};
  const first = (cv.work || [])[0] || {};
  const loc = b.location;
  const city = loc && typeof loc === 'object' && loc.city !== undefined ? f(loc.city) : f(loc);
  const profileUrl = (net) => f(((b.profiles || []).find((p) => String(p?.network || '').toLowerCase().includes(net)) || {}).url);

  const profile = {
    full_name: f(b.name), email: f(b.email), email_confirm: f(b.email), phone: f(b.phone),
    city, summary: f(b.summary),
    current_title: f(b.label) || f(first.position), current_employer: f(first.name),
    linkedin_url: profileUrl('linkedin'), portfolio_url: profileUrl('portfolio'),
    skills: (cv.skills || []).map((s) => f(s.name)).filter(Boolean).join(', '),
    languages: (cv.languages || []).map((l) => f(l.language) + (f(l.fluency) ? ` (${f(l.fluency)})` : '')).filter(Boolean).join(', '),
  };
  for (const k of Object.keys(profile)) if (!profile[k]) delete profile[k];

  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage(EXTENSION_ID, {
      type: 'epimoni:pair',
      jwt: user.jwt, user_id: user.user_id, user_type: user.user_type,
      given_name: user.given_name, family_name: user.family_name,
      profile, cv_label: 'CV du navigateur', taken_at: Date.now(),
    }, (r) => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : r));
  });
  console.log('[epimoni] pairing:', res, 'fields:', Object.keys(profile).length);
  return res;
})(window.__EPIMONI_EXT_ID);
