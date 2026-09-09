---
"a11ign": patch
---

**#71's two defects are fixed on `main` already. What was missing is that nothing checked either one, and
the code said otherwise.**

`resolvedPageUrl` is module-level, and `pageTarget()` reads it at the TOP of `navigateExisting` — so a
value surviving from the previous capture makes capture N+1 of page B ask
`choosePageTarget(expectedUrl = B, resolvedUrl = A)` while the reused window still shows A. **It fails in
the direction that looks like success**: A is a real URL, so nothing throws and nothing reads as absent.
`A11Y_REUSE_BROWSER` is on by default, so that is the normal path.

The fix moved `resolvedPageUrl = null` to the first statement of the function, and its comment said
*"`browser-session.test.ts` pins the ordering, because a statement's POSITION is the property here and
moving it back is a one-line edit that changes nothing a type or a lint check can see."*

**It did not.** Measured: moving the reset back inside the `try`, exactly where it used to be, failed
**none** of that file's 16 tests. A comment naming a guard that is not there is worse than no comment,
because it stops the next reader looking — the #842 shape, in the file whose whole subject is a guard, and
about the one property the comment itself says nothing else can see.

`resolved-page-url-reset.test.ts` pins it now: the reset is the **first** statement, it precedes
`pageTarget()`, and it resets to `null` and never to the requested URL — `resolvedNavigationUrl` returns
the requested URL when nothing redirected, so resetting to it would make "nothing redirected" and "a
previous capture redirected here" the same value. That is the trap that makes the obvious fix wrong, and
the row names it explicitly.

**The row's first defect — the gate comparing with `!==` — is settled rather than assumed.** It uses
`sameDocument` today, and the comment beside it argues the two cannot differ: the branch is reached only
when nothing matched `expectedUrl`, so if `resolvedUrl` is the same document, nothing could match that
either. The argument is sound (`sameDocument` reduces to `normalise(a) === normalise(b)`, and equality of
a function's outputs is transitive by construction) and it was prose. A test now drives the exact input
the row predicts — a resolved URL differing from the requested one only by normalisation — and both
spellings give `fallback`.

**Still open and not in this change: acceptance 4, the two-page capture.** `evidence:check` samples the
synthetic corpus, whose pages do not redirect, so the predicted fields were structurally unable to move.
The designed test is `w3.org/WAI/demos/bad/after/survey.html` and `tfl.gov.uk/modes/tube/`, and it
**belongs to whoever drives the fleet**.
