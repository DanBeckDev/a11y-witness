---
"a11ign": patch
---

**Two changes that #922 was approved with and merged without** — the PR merged between the reviewer's note
and the commit answering it, so they arrive here instead.

**`checkVisibility` now runs on BOTH dialog branches of the DOM census.** It was explicit on the
ARIA-modal branch and implied on the native one. `:modal` normally does imply rendered — a top-layer
dialog — but `showModal()` followed by `display: none` stays `:modal` and shows nothing. The stronger
reason is worker-judge's: **a check explicit on one branch and implied on the other is a difference the
next reader has to reason about**, and it costs nothing to not make them. A test covers the native case.

**And the asymmetry sentence in `ranOutShortOfTheCensus` is sharpened** — *"Withholding needs doubt;
asserting needs proof"*, with what each direction costs when wrong: being wrong here costs a claim nobody
was owed, while being wrong the other way puts a completeness sentence over a page that was never read.
Deferred from #894 for the next change touching that function rather than shipped as a PR that rewords a
comment.

Comment and guard only; no behaviour change beyond the `display: none` modal case.
