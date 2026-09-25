// SPDX-License-Identifier: Apache-2.0
// Every filler the extension ships.
//
// A filler adds evidence about a page or operates a widget; it never decides a field. The
// contract, the hooks and the guarded API are in ARCHITECTURE.md ("Fillers"), and the two
// templates beside this file are the starting point for a new one. Adding one is a file under
// `site/` or `widget/`, a line below, and a fixture directory under test/fixtures/fillers/<id>/
// with at least one trap: the build refuses a filler without them.
//
// Order matters only for widget ownership: the first filler whose `match.widget` claims a
// control operates it. Site fillers come first so that a site can override a generic widget.

import workday from './site/workday.js';
import ariaCombobox from './widget/aria-combobox.js';

export const FILLERS = [workday, ariaCombobox];
