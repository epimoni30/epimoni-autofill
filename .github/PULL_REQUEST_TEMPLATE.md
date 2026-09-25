## What and why

<!-- What does this change, and why? Link the issue if there is one: "Fixes #123". -->

## Checklist

- [ ] `npm run check` passes locally: lint, unit tests, measure, build, e2e.
- [ ] `npm run measure` still reports **0 wrong fills**. If fill rate moved, the numbers are in the description.
- [ ] A new field or board comes with a fixture annotated with `data-expect`, or a trap with `data-expect="none"`.
- [ ] No new permission or host pattern in `manifest.json`, or it was discussed in an issue first.
- [ ] Every new UI string exists in all three `_locales/`.
- [ ] A user-visible change has a line under **Unreleased** in `CHANGELOG.md`.
