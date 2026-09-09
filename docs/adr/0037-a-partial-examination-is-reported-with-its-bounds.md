# ADR 0037: A partial examination is REPORTED with its bounds, not withheld and not rounded up

## Status

Accepted 2026-09-09, ruled by `ceo` on issue #821, with the measurement in `docs/known-gaps.md` §47 as
the input rather than a preference.

**It records a choice that was already implemented and never written down.** `conformance.ts`'s
Requirement 2 has branched on `truncatedSweeps` since before this ADR, and on a truncated capture it
already says *"Part of the page was examined"* and names which sweeps stopped. This ADR is why that is
right, what was rejected to get there, and the two things a later change to that function must not drop.

## Context

**A capture cannot always examine a whole page inside its deadline, and that is arithmetic rather than a
threshold anybody chose.**

Measured 2026-09-09 on the fleet at `691969f6a8f1dd11`
(`runs/witness/2026-09-09T14-31-43-041Z-www-ikea-com.json`): `www.ikea.com/de/de/` served **265 form
controls**. The `formField` sweep walked them in **926 round trips** costing **299.3 s**, of which the
per-field activation — capped by #769's budget at 64 of 265 — spent **121.8 s**. The remaining **~177 s
is the walk itself**, 926 trips at the **163 ms/trip** constant measured across six pages and five sweep
types, whose spread on every sweep with no `onItem` is 1.1–1.2.

**So five of eight structural types stopped on `deadline` having never run.** The budget worked —
`formField` stopped on `exhausted` for the first time and `graphic` ran and found 47 where it had found
0 — and `link`, `list`, `frame` and `postSubmit` starved anyway, because one sweep's walk had already
spent the capture's remaining time.

**No share of the deadline given to the probe changes that.** The walk is not a knob.

This is not a rare page. It is a large retail site, of exactly the shape a first reader points the tool
at, and the question it forces is not *how do we make the capture finish* but **what may a report claim
when it did not**.

## Decision

**A partial examination is reported, with what it did not examine named.**

Requirement 2 of the conformance scope establishes `"Part of the page was examined."` and its limitation
names each sweep that stopped early with its stop reason, followed by the sentence that carries the
whole point:

> Elements beyond that point were never reached, so an absence of findings among them is not evidence
> they are correct.

**And a type whose sweep never ran is reported as `NOT EXAMINED`, distinct from `found: 0`** (#686).
`link 0/340` on a page whose link sweep never started is a true number answering a question nobody asked.

## The two protections, and neither may be dropped without replacing this ADR

**1. A partial capture must never be quotable as a conformance claim by accident.**

The tool's most damaging possible output is a level plus no findings, which reads as certification.
A partial capture is further from a claim than a complete one, not closer, and every sentence it renders
must be false to quote as completeness. Requirement 2's two branches exist for this and the guard is that
they *differ*: if the truncated branch ever renders a sentence the complete branch could also render, the
distinction has been lost.

**2. A partial capture must never be discarded because it is incomplete.**

The IKEA capture found **265 form controls, 80 headings, 6 landmarks and 47 graphics**. Refusing to report
it would throw away most of what 453 seconds of real screen-reader time bought, and would make the tool
silent on exactly the pages most likely to have problems — the large, heavy, commercial ones. **Silence is
not the safe direction here; it is the direction that looks safe.**

The two pull against each other on purpose. A design satisfying only the first reports nothing; a design
satisfying only the second reports a partial as if it were whole.

## Options rejected

**Refuse to report a criterion whose evidence is partial, per criterion rather than per capture.**
Safer-sounding and quieter, and it fails protection 2 in the place it costs most: on a page where five of
eight sweeps starved, nearly every criterion has partial evidence, so the report goes nearly silent. It
also converts a *coverage* fact into a *conformance* one — "we did not look" would render identically to
"we looked and cannot say", and this project already pays for keeping `cantTell` and "not assessed" apart.

**Split the page across captures and combine them.** Changes what a capture *is*. `environmentKey`,
`provenance` and the cache all assume one capture is one page, and a combined record would carry two
`codeVersion`s, two clock times and — as #688 measured on IKEA itself, a **40% shape change in one
afternoon** — potentially two different documents. Rejected as a change to the unit of evidence, not to
the report. If it is ever revisited, #687's document identity is the precondition.

**Say the page is too large and stop.** Honest and useless. It discards the evidence already collected
(protection 2) and tells a reader nothing they can act on, since "too large" is a fact about our deadline
rather than about their page.

**Report the partial silently — i.e. as though complete.** Not seriously considered, recorded because it
is what the tool did before #686: `found: 0` from a sweep that never ran is indistinguishable from a page
with none, and that is the defect this whole line of work began from.

## The §5.2 sentence's fate

**`"Every structural sweep ran until the page ran out of elements"` stays, unchanged, in the
`truncated.length === 0` branch only.**

It was proposed for removal on the grounds that it is false on the IKEA capture. **It is not rendered
there** — `truncatedSweeps` returns 10 of 16 outcomes on that capture, every `deadline` stop in both
directions, so the complete branch is not taken. Verified rather than assumed; the row that proposed the
removal had grepped the file for the string rather than asking what the capture renders, and a grep for a
string is not a check on what a branch outputs.

**What the sentence must keep is its condition, not its wording.** Any change that makes it render when
`truncatedSweeps` is non-empty breaks protection 1.

## Consequences

- **Report and coverage sentences must state which of the two branches they came from**, so a reader
  never has to infer completeness from the absence of a caveat.
- **A capture with `NOT EXAMINED` types cannot render a sentence that reads as a full-page claim.** That
  is a testable property against the IKEA capture, which is on disk, and is the code change this ADR
  authorises as its own row.
- **`docs/known-gaps.md` §47 carries the measurement**, so the next person to propose a budget knob finds
  the arithmetic before they tune anything.
- **This ADR does not make the capture finish.** Whether IKEA genuinely serves 265 form controls or the
  sweep walks more than is there is #800, and whether the deadline is right for such a page is a separate
  question this ADR deliberately does not answer.
