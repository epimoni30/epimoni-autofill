// SPDX-License-Identifier: Apache-2.0
// Every measured fixture page, in the order `npm run measure` reports them. Shared with the
// playground build, so a fixture added here, or any filler's own page, discovered, is
// measured in CI and offered to visitors at the same moment.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export function fixtureList(fixturesDir) {
  return [
    'france-travail.html',
    'hellowork.html',
    'taleez-embed.html',
    'radios.html',
    'traps.html',
    'parcours.html',
    // Every filler's own pages, discovered: a filler is measured the moment it has a fixture.
    ...readdirSync(join(fixturesDir, 'fillers')).flatMap((id) =>
      readdirSync(join(fixturesDir, 'fillers', id))
        .filter((f) => f.endsWith('.html'))
        .map((f) => `fillers/${id}/${f}`),
    ),
  ];
}
