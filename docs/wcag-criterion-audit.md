# Auditing every criterion against its official text

**Why this exists.** 3.1.2 was argued for a day and settled wrongly because nobody followed the link on
*programmatically determined*. `criterion-coverage.ts` makes a claim about all 54 criteria and not one had
been checked against W3C. The procedure is [`.claude/skills/wcag-criterion-check`](../.claude/skills/wcag-criterion-check/SKILL.md);
this file is the record of running it.

**Order.** The 10 `assessed` criteria first, then the 7 `partial`, then the 4 `reachable`, then the 33
`out-of-scope` whose REASONS are also claims. The failure modes are not symmetric: a misread `assessed`
criterion is a wrong finding on somebody's page; a misread `out-of-scope` one is only a finding we never
make.

**A criterion passes this audit when** its official text, every defined term in it, and its exceptions are
all consistent with what `criterion-coverage.ts`, `rule-ownership.json`, `act-rules.ts` and `rules.ts`
say — and where they are not, the difference is stated in the rule's `assumptions` rather than absent.

---

## 1.1.1 Non-text Content — ONE FINDING

> "All non-text content that is presented to the user has a text alternative that serves the equivalent
> purpose, except for the situations listed below." — [Understanding 1.1.1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content)

Six exceptions: **Controls/Input**, Time-Based Media, Test, Sensory, CAPTCHA, **Decoration/Formatting/Invisible**.

**What is right.** The Decoration exception is handled exactly, and by construction rather than by a
check: `classifyAXNode` skips `node.ignored`, so a correctly-implemented `alt=""` never reaches the
census. The criterion asks decorative content be "implemented in a way that it can be ignored by
assistive technology" — being ignored is precisely the condition the census filters on. `pure decoration`
is defined as "serving only an aesthetic purpose, providing no information, and having no functionality",
and nothing in our rule contradicts that.

`a11y-witness:alt-text-is-a-filename` maps `secondary` and its assumption quotes the reason from the
criterion — "the criterion asks whether the alternative serves an equivalent PURPOSE, and a string that
looks like a file name could legitimately be the right description". Correct, and correctly a referral.

**FINDING — five of six exceptions are unstated.** `a11y-witness:unnamed-graphic-count` states its
assumptions about ignored and generated nodes, and says nothing about the other five. The one that can
bite is **Controls, Input**: *"If non-text content is a control or accepts user input, then it has a NAME
that describes its purpose."* An `<img>` inside a named button satisfies 1.1.1 through the BUTTON's name,
and `name` is defined as "text by which software can identify a component within web content to the user"
— which the image itself need not carry. CLAUDE.md already records the announcement shape that produces:
`<button><img alt="Submit Search"></button>` speaks as "Submit Search, graphic, button" and was once
parsed as a named graphic PLUS an unnamed button.

Not currently firing wrongly — `rules:real-pages` is clean across 86 conformant pages — so this is an
UNSTATED ASSUMPTION rather than a live defect. That is exactly what `act-rules.ts` exists to hold: "Every
wrong finding this project has shipped traces to an assumption nobody had written down."

## 1.4.2 Audio Control — CLEAN

> "If any audio on a web page plays automatically for more than 3 seconds, either a mechanism is available
> to pause or stop the audio, or a mechanism is available to control audio volume independently from the
> overall system volume level." — [Understanding 1.4.2](https://www.w3.org/WAI/WCAG22/Understanding/audio-control)

Both halves are honoured. `if (!element.autoplay || element.muted || element.controls) continue` — the
`controls` attribute IS the "mechanism ... to pause or stop", and muted audio makes no sound. And the
three-second threshold, which the rule cannot measure, is why it maps `secondary`: its assumption says so
in the criterion's own terms — "The criterion applies to audio playing for more than THREE SECONDS, and
this rule cannot measure duration — a two-second notification chime autoplaying is not a [failure]".

A rule that cannot measure a threshold the criterion states, and REFERS because of it, is the right
handling of that gap.

## 2.4.4 Link Purpose (In Context) — CLEAN

> "The purpose of each link can be determined from the link text alone or from the link text together with
> its programmatically determined link context, except where the purpose of the link would be ambiguous to
> users in general." — [Understanding 2.4.4](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context)

Context qualifies as: the same paragraph, list item, table cell, associated header cells, or the current
sentence. `a11y-witness:vague-link-text` cannot see any of them, and says so: "2.4.4 permits the purpose
to be determined from the link's programmatically determined CONTEXT — its sentence, paragraph, list item
or table cell — so 'To apply for a permit, click here' conforms. This rule cannot see that context, so it
is stricter than the criterion and closer to 2.4.9, which is AAA." Mapped `secondary`.

That assumption names the four context types the Understanding page names. It is the clearest example in
the set of a rule knowing what it is not.

## 3.3.1 Error Identification — TWO FINDINGS

> "If an input error is automatically detected, the item that is in error is identified and the error is
> described to the user **in text**." — [Understanding 3.3.1](https://www.w3.org/WAI/WCAG22/Understanding/error-identification)

`input error` is defined as "Information provided by the user that is not accepted".

**FINDING 1 — the note describes a page that may CONFORM.** `criterion-coverage.ts` says our finding is
"A validation error that is displayed but never announced". The criterion requires the error to be
*described in text*; it does not require it to be announced. A page that shows the error in text and never
announces it satisfies the criterion's words.

What our evidence actually shows is narrower and stronger: the field was re-read after the submit and NVDA
said nothing, which is evidence the error text is not programmatically ASSOCIATED with the field — and an
error a screen reader cannot reach is not one where "the item that is in error is identified" for that
user. **That is the argument, and it is nowhere in the code.** The note asserts the weaker, wrong thing.

Mitigated by the layer rather than by the reasoning: `3.3.1:validation-error-silent` is absent from
`rule-ownership.json`, so it is model-decided, sets no `mapping`, and reports `cantTell`. The tool refers
rather than asserts. That is the right outcome reached for the wrong reason, which is worth fixing before
it moves layers.

**FINDING 2 — the entry contradicts itself.** Its `note` says the form probe is "OFF for every real-page
capture, because submitting a form on a site we do not own is not a review", while its own
`realPageEvidence.because` — corrected 2026-09-04 — says the opposite: ADR 0024's declared `formState`
makes submitting something the corpus authorises, and it has been measured live on W3C's survey. One
entry, two halves, opposite claims. The `note` is the stale half.

---

## Still to audit

| status | criteria |
|---|---|
| `assessed` (6 left) | 1.3.1, 2.4.6, 4.1.3, 3.3.3, 3.2.1, 3.2.2 |
| `partial` (7) | 2.1.1, 2.1.2, 2.4.1, 2.4.2, 2.4.3, 3.3.2, 4.1.2 |
| `reachable` (4) | 1.3.5, 2.1.4, 2.5.3, 3.1.1 |
| `out-of-scope` (33) | their REASONS are claims too; lowest priority |

**What the first four suggest about the rest.** Three of four were clean, and the clean ones were clean
for the same reason: the rule's `assumptions` quote the part of the criterion the rule cannot reach, and
the mapping is `secondary` because of it. Both findings are in prose that drifted from the code — an
unstated exception, and a note contradicting its own entry — rather than in a rule that fires wrongly. So
the likely shape of the remaining work is DOCUMENTATION correction, not rule correction. That is a
prediction, and the point of writing it down is that the remaining criteria can refute it.
