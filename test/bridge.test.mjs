// The site bridge (src/epimoni/bridge.js): a relay that must decide nothing and forward
// little. The script is run against a stubbed window and `chrome`, and what reaches the worker
// is asserted directly. What the worker then does with a bridged request is pair.test.mjs's.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SITE = 'https://www.epimoni30.com';
const SRC = readFileSync(new URL('../src/epimoni/bridge.js', import.meta.url), 'utf8');

/** Load the bridge on a page at `origin`; returns what it forwards and what it posts back. */
function load({ origin = SITE, top = true, answer = { ok: true }, throws = false } = {}) {
  const sent = [];
  const posted = [];
  const listeners = [];
  const win = {
    addEventListener: (type, fn) => type === 'message' && listeners.push(fn),
    postMessage: (data, target) => posted.push({ data, target }),
  };
  win.top = top ? win : {};
  const chrome = {
    runtime: {
      sendMessage: (m) => {
        if (throws) throw new Error('Extension context invalidated.');
        sent.push(m);
        return Promise.resolve(answer);
      },
    },
  };
  const attrs = {};
  const document = { documentElement: { setAttribute: (k, v) => (attrs[k] = v) } };
  new Function('window', 'location', 'chrome', 'document', SRC)(win, { origin }, chrome, document);
  const dispatch = async (data, { source = win, from = SITE } = {}) => {
    for (const fn of listeners) fn({ source, origin: from, data });
    await new Promise((r) => setTimeout(r, 0));
  };
  return { sent, posted, listeners, dispatch, attrs };
}

const request = (msg, id = 'r1') => ({ epimoni: 'request', id, msg });

test('a pairing request is forwarded in its envelope, and the answer comes back by id', async () => {
  const b = load({ answer: { ok: true, mode: 'confirm', id: 'p1' } });
  await b.dispatch(request({ type: 'epimoni:pair', cv: { basics: {} } }, 'abc'));
  assert.deepEqual(b.sent, [{ type: 'site', msg: { type: 'epimoni:pair', cv: { basics: {} } } }]);
  assert.deepEqual(b.posted, [
    { data: { epimoni: 'response', id: 'abc', res: { ok: true, mode: 'confirm', id: 'p1' } }, target: SITE },
  ]);
});

test('only the three site messages cross', async () => {
  const b = load();
  for (const type of ['epimoni:ping', 'epimoni:pair-status']) await b.dispatch(request({ type }));
  // What an extension page may ask, or a dev-only hook, never comes through the bridge.
  for (const type of ['pair:accept', 'forget', 'unpair', 'profile', 'epimoni:devfill', 'analyse'])
    await b.dispatch(request({ type }));
  assert.deepEqual(
    b.sent.map((m) => m.msg.type),
    ['epimoni:ping', 'epimoni:pair-status'],
  );
});

test('a message from a frame, another window or another origin is ignored', async () => {
  const b = load();
  await b.dispatch(request({ type: 'epimoni:ping' }), { source: {} });
  await b.dispatch(request({ type: 'epimoni:ping' }), { from: 'https://evil.example' });
  await b.dispatch({ epimoni: 'response', id: 'x', msg: { type: 'epimoni:ping' } });
  await b.dispatch(request({ type: 'epimoni:ping' }, 42));
  await b.dispatch('epimoni:ping');
  assert.equal(b.sent.length, 0);
  assert.equal(b.posted.length, 0);
});

test('the bridge does not install anywhere but the top frame of the site', () => {
  for (const b of [load({ origin: 'https://evil.example' }), load({ top: false })]) {
    assert.equal(b.listeners.length, 0);
    assert.deepEqual(b.attrs, {});
  }
});

test('the site can tell there is a bridge without waiting for a ping', () => {
  assert.deepEqual(load().attrs, { 'data-epimoni-bridge': '' });
});

test('an extension that went away answers, rather than leaving the site waiting', async () => {
  const b = load({ throws: true });
  await b.dispatch(request({ type: 'epimoni:ping' }));
  assert.deepEqual(b.posted[0].data.res, { ok: false, error: 'unreachable' });
});
