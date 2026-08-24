# 0021 — The layer that decides a subtype must be the layer allowed to claim it

**Status:** accepted 2026-08-24

## Context

`compare-layers.mjs` records what makes this project different from a static scanner, and it is specific:

> axe can see that `aria-expanded` EXISTS; it cannot see that it never CHANGES.

`4.1.2:state-change-silent` is that difference. It is the flagship finding.

Measured on 2026-08-24, on the product path — the CLI's own `criterionOutcomes` — across 18 real pages
whose publishers declare them conformant:

| | |
|---|---|
| criteria the tool **asserted** wrongly | **0** |
| criteria it **referred** to a human (`cantTell`) | 4 |
| publisher-declared inaccessible pages caught | 3 of 3 |

Zero wrong assertions is the good news. The rest is not: **the model asserts nothing at all.**
`findingsFromScores` creates findings with no `mapping`, and `RequirementMapping` defines absent as
`secondary` — "a new finding source has to opt IN to asserting non-conformance". ACT and EARL both call
that `cantTell`. Verified end to end: the identical finding scores `cantTell` unmapped and `failed` when
conformance-mapped.

So every model-decided subtype is reported as "needs human confirmation" — including the flagship one.

And a deterministic rule for it already existed, in measured form. `rules.ts` recorded:

> A rule on that reached **69/69 EXACT with no false positives across 1001 conformant corpus records** …
> The reason [for not adding it] is now **ownership, not evidence**. `4.1.2:state-change-silent` is
> model-owned and scores 59 true positives, 0 false positives, 0 false negatives. A deterministic rule
> would duplicate a decision that already holds.

That reasoning weighed accuracy and nothing else.

## Decision

**A subtype whose evidence is DECISIVE belongs to the layer that may state a conclusion from it.**

`4.1.2:state-change-silent` moves to the rules. Re-measured after the move, over every capture carrying
state evidence: **69 true positives, 0 false positives, 0 false negatives across 144 captures.**

The ownership rule — exactly one layer decides each subtype — is sound and stays. What it lacked is that
*"which layer is more accurate"* and *"which layer may assert"* are different questions. A model that is
right 59 times out of 59 and may only ever say "possibly" loses to a rule that is right 69 times out of 69
and may say "this fails", when the evidence supports the stronger claim.

**Decisive** is the test, and it is narrow. The control announced `collapsed`, was activated —
`probeDisclosure` calls `nvda.act()` before reading the state — and still announces `collapsed`. It has
contradicted itself. Either the state did not change or the change was not announced, and both are 4.1.2
failures for the same user. There is no second reading.

## Consequences

- The finding that distinguishes this tool from every static scanner is now **asserted** rather than
  referred. That is the whole point of the change.
- The rule is deliberately narrow: only `collapsed`/`expanded`. `checked`, `pressed` and `selected` also
  change on activation, but Enter is not always a checkbox's activation, so "it did not change" acquires a
  second cause — and a rule that ASSERTS must have exactly one explanation per case.
- It reads states through `packages/evidence`'s shared grammar rather than a fourth hand-written state
  vocabulary. Writing it exposed that `focused` was missing from that grammar, which was silent in the
  worst way: the parser stopped at it, so `"…, button, focused, collapsed"` produced NO states and a
  before/after comparison would have compared two empty lists and found them equal.
- `3.3.1:validation-error-silent` and `4.1.3:form-activation-silent` were the obvious next candidates —
  also model-owned, also on the `compare-layers` list. **Investigated 2026-08-24 and they stay referred.**
  See "Why the other two cannot follow" below; it is a property of the evidence, not a gap in the work.

## Why the other two cannot follow

`3.3.1:validation-error-silent` and `4.1.3:form-activation-silent` look identical to the state-change case
and are not. Their evidence:

    3.3.1  bad   {"control": "Submit request, button", "kind": "submit",     "after": ""}
           good  {"control": "Submit request, button", "kind": "submit",     "after": "Reference number, edit, invalid entry, …"}
    4.1.3  bad   {"control": "Show bags, button",      "kind": "taskButton", "after": ""}
           good  {"control": "Show bags, button",      "kind": "taskButton", "after": "Showing 2 bags."}

Silence versus announcement — which is ambiguous, because **silence has two causes**. "Nothing was announced
after submitting" is a failure only if the submission was *rejected*; if it succeeded, silence is correct.
"Nothing was announced after filtering" is a failure only if the results *changed*.

The state-change case has no such gap. A control that announced `collapsed`, was activated, and still
announces `collapsed` has **contradicted itself**. The contradiction is self-contained: no fact outside the
announcement is needed to see it.

**The capture cannot currently supply the missing fact.** Measured over the corpus: 254 captures carry a
submit, 248 leave the form on the page, and the other 6 are `custom-control-*` pages that never had a form
field. **There is not one successful submission in the corpus** — so it cannot even express the conformant
case a rule would fire on wrongly. And `structureCensus` runs ONCE, after the interaction, so there is
nothing to compare it against.

There is a sharper way to put it. A silently-rejected form and a silently-successful one produce *identical*
screen-reader evidence — and that identity **is the criterion**. The user cannot tell what happened; that is
the barrier 3.3.1 describes. Our tool sees exactly what the user hears, so it is in exactly the user's
position, and it cannot tell either. `cantTell` is not a shortfall here. It is the correct answer, and ACT
has a word for it.

**The route to assertion, if it is ever wanted**, is a capture change and not a model or rule change: record
a structural census or content fingerprint BEFORE the interaction as well as after. "The content changed and
nothing was announced" is then self-contained in the same way the state-change contradiction is. That costs
a `CAPTURE_PROTOCOL_VERSION` bump and a full recapture, which is a real price — and it is the only thing
that would move these two, so no amount of corpus or model work should be spent trying.

## Alternatives rejected

- **Make model findings conformance-mapped.** It would let the scorer assert everywhere, including on
  judgement criteria where the evidence does not support assertion — 2.4.4 permits purpose to come from
  context we often cannot see, which `rules.ts` already notes with "click here" as the worked example. The
  conservative default is right; what was wrong was leaving a decisive subtype behind it.
- **Leave it with the model and report `cantTell`.** Honest, and it under-claims a finding whose evidence
  is a self-contradiction. A tool that refuses to state what it can prove is not being careful, it is being
  useless in the one place it is unique.
- **Duplicate: rule asserts, model also scores.** Two layers deciding one subtype is what the ownership
  declaration exists to prevent, and a disagreement between them would have no resolution rule.

## What would falsify this

A conformant page whose disclosure legitimately announces the same state after activation — a control
already open, or one whose activation is not Enter. The rule would assert wrongly there, and the narrow
state set is what bounds that risk. `npm run rules:gate` scores it against every conformant record on every
run; a single false positive there is the signal to narrow it further or hand it back.
