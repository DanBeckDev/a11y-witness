---
"a11ign": minor
---

`npm run witness` now writes the capture it took to `runs/witness/<stamp>-<slug>.json` and prints the
path as the last line of its report (or as an `artifactPath` field alongside `--json`), so a run that
goes wrong — a consent overlay, a page that reads short, a timing that surprises you — leaves you a real
file to send someone or open with `npm run capture:explain`, instead of only a printed report. This is
ON by default; pass `--no-keep` to skip the write, which is confirmed explicitly rather than silently
doing nothing.
