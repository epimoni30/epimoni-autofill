# Trademarks and brand

The code in this repository is Apache-2.0 (see `LICENSE`). The brand isn't, and the licence
says so itself: section 6 gives no permission to use the licensor's trade names, trademarks or
product names.

The code licence doesn't cover:

- the names Epimoni and Epimoni Autofill;
- the E30 logo in all its variants, including `logo/e30-violet-solid.svg`;
- the rendered icons in `icons/`;
- the store listing text in `_locales/*/messages.json` that names the product.

## If you fork it

Use the code however the licence allows. Before you publish a fork on the Chrome Web Store or
anywhere else, swap in your own name and logo: change `logo/`, run `npm run icons` again, and
change `ext_name` in each `_locales/*/messages.json`. A fork that ships with our logo is
presenting itself as us. The licence doesn't allow that, and neither do the store's
impersonation rules.

Plain descriptive use is fine. Saying your fork is based on Epimoni Autofill, or comparing it
with ours, is completely normal.

## Regenerating the logo

`logo/e30-violet-solid.svg` is a copy of our brand kit, which lives outside this repository.
The logo is text set in the Geist typeface, so `npm run icons` only reproduces the shipped PNGs
on a machine that has Geist installed. Anywhere else the SVG falls back to `system-ui` and you
get slightly different letters at the same sizes, without any warning.

So the PNGs committed in `icons/` are the reference. `npm run icons` is there for when the logo
changes. It isn't a build step, which is also why `npm run check` doesn't run it.
