# Book-grounded eval pages

Paired good/bad example pages authored from published, expert-reviewed
accessibility references, used to extend the eval beyond the W3C tutorial
baseline (`../tutorials/`). Same principles as that baseline:

- **Authoritative ground truth.** The correct techniques and the failures both
  come from the sources below, with the WCAG success criterion each documents —
  not from our own judgment.
- **Paired.** Each topic has a `*-good.html` (correct technique, must score zero
  findings → precision) and a `*-bad.html` (a documented failure, must be caught
  → recall).
- **Contamination-resistant.** Authored fresh from the guidance.
- **Observable only.** `expect` is limited to what an NVDA read-through (or an
  interaction probe) can actually surface; defensible criterion overlaps go in
  `allow`.

## Sources

- *Web Accessibility Cookbook* — Manuel Matuzović (O'Reilly, 2024). Chapters 3
  (links), 4 (buttons), 9 (forms), 10 (filters / live regions), 11 (tables).
- *Practical Web Accessibility* — Ashley Firth (Apress, 2nd ed. 2024).
  Chapters 4–6 (alt text, custom controls, forms), 15–17 (headings, link text),
  25 (tables).

## Topics

| Topic | File stem | Primary criterion | Documented failure |
|---|---|---|---|
| Link purpose | `links` | 2.4.4 | ambiguous "Click here" / "Read more" / "Go!" link text |
| Descriptive headings | `headings` | 2.4.6 | vague / run-on / non-descriptive headings |
| Alt-text quality | `alt-quality` | 1.1.1 | alt present but a declaration ("A graph about stocks") or generic ("image") — distinct from the *absence* case in `../tutorials/images-bad` |
| Custom controls | `custom-control` | 4.1.2 | icon-only button with no name + `<div>`/`<span>` styled as a control with no role |
| Status messages | `filter-status` | 4.1.3 | filter updates results with no live region → silent on the interaction probe |
| Table semantics | `layout-table` | 1.3.1 | layout table without `role="presentation"` → spurious table semantics announced |

## Status

The HTML pages are authored. Their capture transcripts
(`../../fixtures/books/*.json`) are produced by the real NVDA worker; until a
page is captured, its case is listed by the eval runner as **pending capture**
and skipped (it does not affect metrics). Capturing a page activates its case
with no further code change.

The `expect` / `allow` sets in `../../cases.ts` are provisional: they are based
on the documented failure for each topic, but the exact criteria should be
re-checked against the first real NVDA transcript (announcement strings are
screen-reader/version-specific — see the note in `src/spike/rules.ts`). Tune
`expect`/`allow` to what NVDA actually announces when the fixture is captured.
