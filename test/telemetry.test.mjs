// SPDX-License-Identifier: Apache-2.0
// A report from a page is cut down to counts and field names before it leaves the machine.
// The content script lives in the page, so the worker checks rather than trusts it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageMeta } from '../src/epimoni/telemetry.js';

const URL_ = 'https://jobs.example.org/apply/1';

test('an ordinary fill report passes whole, host from the sender', () => {
  const meta = {
    what: 'fill_run',
    host: 'jobs.example.org',
    filled: 5,
    suggested: 2,
    keys: 'given_name,family_name,email,work.company',
    fillers: 'aria-combobox',
    refill: 1,
  };
  assert.deepEqual(pageMeta(meta, URL_), meta);
});

test('a value, a sentence or an unknown key never gets through', () => {
  const got = pageMeta(
    {
      what: 'fill_run',
      keys: 'camille.dupont@example.org',
      key: 'Camille Dupont',
      fillers: 'a,b,+33 6 12 34 56 78',
      filled: 'Nantes',
      suggested: 2.5,
      controls: -1,
      email: 'camille.dupont@example.org',
      value: 'anything',
    },
    URL_,
  );
  assert.deepEqual(got, { what: 'fill_run', host: 'jobs.example.org' });
});

test('the host is where the browser says the page is, not what the page says', () => {
  assert.equal(pageMeta({ host: 'elsewhere.example' }, URL_).host, 'jobs.example.org');
  assert.equal(pageMeta({ what: 'not-a-verb' }, URL_).what, undefined);
  assert.deepEqual(pageMeta(null, 'not a url'), {});
});
