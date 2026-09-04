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

**RESOLVED 2026-09-04: the prediction was right, my first "refutation" of it was wrong, and only the
CAPTURE could say so.** `graphicUnnamedDetail` reports both nameless images on cqc.org.uk with
`ancestorRole: "link"`, `ancestorName: "The Care Quality Commission"` — the site logo, inside a named
link, conforming through that link's name exactly as the Controls/Input exception provides. The exception
is now enforced, not merely documented.

What follows is the wrong turn, kept because it is the more useful half.

**The first attempt — an instance arrived, and inspecting the LIVE PAGE refuted my reading of it.** `rules-real-pages` refused
the verdict pipeline at stage 12 of 13 with one new finding: `1.1.1` on
`cqc.org.uk/search/all?query=hospital`, `graphicUnnamed=2`. I called it the Controls/Input exception
firing, on the strength of the opening announcements containing "menu button, sub Menu, Search". **That
was a guess dressed as a diagnosis.**

Loading the page and enumerating its image-like elements says otherwise:

- 30 image-like elements, 24 nameless and not `aria-hidden`.
- **Every `<img>` carries `alt=""`** — decorative, which Chromium marks ignored, so the census never sees
  them. Not one `<img>` lacks an alt.
- So the two the census counted can only be bare **`<svg>` with no `role` and no label**.
- Of those, SOME are inside named links ("The Care Quality Commission") — the exception — and **several
  are inside no control at all**.

A bare unlabelled `<svg>` outside any control that Chromium exposes as an image is plausibly a REAL 1.1.1
finding: if it is decorative it should carry `aria-hidden="true"`. So this may be the third of the rule's
three causes — "the finding is right and the publisher's claim is not", which has happened twice — and not
the first.

**Unresolved, and it needs the capture's own evidence rather than the live page**, because these are live
sites their publishers keep editing and the page I loaded is not the page that was captured. Recorded this
way because the alternative was to let a prediction validate itself: I read the criterion, predicted a
class, saw a finding of roughly the right shape, and called it confirmed. The evidence did not support
that, and the rule's own output had already said to read the evidence first. That is exactly what `act-rules.ts` exists to hold: "Every
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

## 2.4.6 Headings and Labels — ONE FINDING

> "Headings and labels describe topic or purpose." — [Understanding 2.4.6](https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels)

`label` is defined as "Text or other component with a text alternative that is presented to a user to
identify a component within web content".

**What is right, and it is the trap this criterion sets.** W3C states outright that it "does not require
headings or labels" to exist, and points at 3.3.2 for whether a label is present. A rule detecting ABSENCE
would fire on conformant pages — the shape 2.4.1 was nearly shipped with. Ours detects VAGUE headings, not
missing ones.

**FINDING — we cover headings, the criterion says "headings AND labels".** One corpus subtype,
`2.4.6:regex`, built from `headings-vague-*` cases and keyed on `generic_heading_present`. Nothing looks
at labels. The label half is REACHABLE and simply not built: NVDA announces a field's label, so "Field 1"
or "Text box" is as audible as a vague heading. A corpus gap, not a layer one — on the backlog.

**And a correction of my own, made and reverted within the hour.** I changed the status to `partial`,
then read this file's own header: *"`status: "assessed"` means 'we have evidence and a decider', never
'this answer is exact'."* We have both, for headings. Changing it was acting on a paraphrase of `partial`
instead of the definition twelve lines above the entry — the exact failure this audit exists to catch,
committed inside the audit. The NOTE correction stands; the status went back.

## 1.3.1 Info and Relationships — CLEAN

> "Information, structure, and relationships conveyed through presentation can be programmatically
> determined or are available in text." — [Understanding 1.3.1](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships)

Eleven failure techniques (F2, F33, F34, F42, F43, F46, F48, F90, F91, F92, F111); we address three modes
— fake headings, unassociated table headers, and no headings at all — and the note says which, including
that heading HIERARCHY is not checked.

**The alternative in the criterion text is the thing to get right, and the rule already does.** Structure
must be programmatically determined **or available in text**, and a page conveying no heading structure
at all passes trivially. `a11y-witness`'s no-headings rule states exactly that: "a page with genuinely no
headings conveys no heading structure to lose. Having none is strong evidence that styled text stands in
for headings; proof needs the visual layer" — and it requires the tree to CONFIRM zero headings rather
than trusting a sweep, plus a `MIN_CONTENT_LINES` floor so a short page is not accused.

Worth noting for later mapping work: **F111 "Control with visible label but no accessible name" is listed
under 1.3.1**, not only 4.1.2. Our unnamed-control findings could legitimately report against both.

## 4.1.3 Status Messages — ONE FINDING, and one thing that is right for a non-obvious reason

> "In content implemented using markup languages, status messages can be programmatically determined
> through role or properties such that they can be presented to the user by assistive technologies
> **without receiving focus**." — [Understanding 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages)

`status message` is defined as "Change in content that is not a change of context, and that provides
information to the user on **the success or results of an action**, on **the waiting state** of an
application, on **the progress of a process**, or on **the existence of errors**."

**RIGHT, AND FOR A REASON WORTH STATING.** "Without receiving focus" is the whole mechanism, and it makes
the CHANNEL the evidence comes from decisive. `status_update_announced` and `form_change_empty` both read
`formChanges[].after`, which `activateAndCaptureDelta` captures immediately after the activation and
BEFORE any navigation — so it is speech the page produced on its own. That is exactly what the criterion
asks about.

The channel that could not answer it is `postSubmitFields`: a re-read of the fields, reached by
navigating to them. Text found that way proves only that the text exists somewhere reachable, never that
it was presented without focus — a page with no live region at all announces its error on re-read. The
feature `post_submit_present` reads that channel and is available to the head, so it is corroboration
rather than evidence for this criterion, and the coverage note now says so.

**FINDING — one of the criterion's four categories.** The corpus has a single subtype,
`4.1.3:form-activation-silent`. That covers "the success or results of an action", and overlaps "the
existence of errors" with 3.3.1. **Waiting state** and **progress of a process** are not covered at all —
a live region announcing "Loading…" or "3 of 10 complete" is as audible as any other, so this is a corpus
gap rather than a layer one. On the backlog.

## 3.3.3 Error Suggestion — THE MOST SERIOUS FINDING IN THIS AUDIT

> "If an input error is automatically detected **and suggestions for correction are known**, then the
> suggestions are provided to the user, **unless it would jeopardize the security or purpose of the
> content**." — [Understanding 3.3.3](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion)

`a11y-witness:error-remedy-missing` maps **`conformance`** — it ASSERTS — and fires whenever an announced
error carries no instruction. The criterion has two normative conditions on that, and the rule guards
neither and stated neither.

**The security exception.** *"Incorrect password"* withholding the reason is the canonical case, and it is
REQUIRED behaviour rather than a failure. This rule would assert 3.3.3 against every login form it was
pointed at.

**"Suggestions for correction are known".** "That username is taken", "This code has expired" — no
correction exists to suggest, and the criterion does not ask for one. An error with no instruction can
conform.

**How close this is to shipping wrongly.** It cannot fire on a real page today: `probeForms` is off in the
CLI and for real-page captures, so `rules:real-pages` reports zero by construction — which is why 86
conformant pages being clean says nothing about this rule. But **the GitHub Action defaults `probe-forms`
ON**, deliberately, because "a workflow in your own repository is testing your own application, where
submitting a form is the intended act". A login form is exactly that. The first consumer to point the
Action at one gets an asserted conformance failure for behaviour the criterion requires.

Both conditions are now in the rule's `assumptions`, and the remedy is on the backlog: the security case
is cheap and readable (NVDA announces a password field distinctly, so `postSubmitFields` can gate it);
the "suggestions known" case is not readable from an announcement at all, which is an argument that this
mapping should be `secondary`. **Changing what the product asserts is a decision, not a tidy-up**, so it
is recorded rather than taken.

This also refutes the prediction made after the first four criteria — that the remaining work would be
documentation correction rather than rule correction. It is not.

## 3.2.1 On Focus and 3.2.2 On Input — SAME RULE, SAME SHAPE AS 3.3.3

> "When any user interface component receives focus, it does not initiate a change of context."
> — [Understanding 3.2.1](https://www.w3.org/WAI/WCAG22/Understanding/on-focus)

`change of context` is defined as a change of **user agent**, **viewport**, **focus**, or **"content that
changes the meaning of the web page"**. And the criterion carries a note that decides this entry:

> *"A change of content is not always a change of context. Changes in content, such as an expanding
> outline, dynamic menu, or a tab control do not necessarily change the context, unless they also change
> one of the above (e.g., focus)."*

`a11y-witness:context-change-without-action` maps **`conformance` on both criteria** — it asserts — and
fires on any difference between the title read before the interaction and the title read after.

**FINDING 1 — a title change is not by itself a change of context.** A page appending a result count, or
an SPA putting the active filter in its title, changes CONTENT and conforms. The rule asserts a failure.
Its own example — "Archive search" becoming "Results for 123456" — does change meaning, which is why a
bare difference looked sufficient.

**FINDING 2 — attribution is assumed, not established.** The probe focuses, then reads the title. A title
that moved for an unrelated asynchronous reason is credited to the focus. This repo guards exactly that
elsewhere — `baselineQuiet` before reading a delta, `probes.sameState` between channels — and this rule
has neither.

**FINDING 3 — F55 is missed, and it is a named failure of this criterion.** "Using script to remove focus
when focus is received": FOCUS is itself one of the four things a change of context can be, so a control
that throws focus elsewhere fails 3.2.1 with the title untouched. `focusOrder` could witness it.

What the rule states well is the under-coverage it already knew about — "a context change that leaves the
title alone ... is not witnessed here". The three above are the ones it did not know, and two of them
mean it can assert against a conforming page.

---

## 2.1.2 No Keyboard Trap — CLEAN

> "If keyboard focus can be moved to a component of the page using a keyboard interface, then focus can be
> moved away from that component using only a keyboard interface" — and if a non-standard method is
> needed, "the user is advised of the method for moving focus away."
> — [Understanding 2.1.2](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap)

Two traps here, and the rule avoids both. The criterion allows exit by **unmodified arrow keys** as well
as Tab, and our probe presses Tab only; and it PASSES a trap that advises its own escape route. The rule's
third assumption states both, quoting the criterion: "2.1.2 allows focus to be moved away by 'unmodified
arrow or tab keys or other standard exit method', and permits a non-standard method if the user is advised
of it. We press Tab only, and we cannot see an on-page advisory, so a repeat is strong evidence and not
proof." Mapped `secondary` accordingly — and both its branches check `escapeReleasedFocus`, which is the
standard exit method the criterion names.

## 3.3.2 Labels or Instructions — CLEAN BOUND, one untested half

> "Labels or instructions are provided when content requires user input."
> — [Understanding 3.3.2](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions)

**The bound is right, and W3C frames it the same way we do.** Their page: "It is possible for controls and
inputs to have an appropriate accessible name or description (e.g. using `aria-label="..."`) and therefore
pass Success Criterion 4.1.2, but to still fail this success criterion (if the labels or instructions
aren't presented to all users)." Our rule's own comment: "A control can pass 4.1.2 with an `aria-label`
and still fail 3.3.2 when no label is visible to sighted users, and a screen-reader transcript cannot see
that case." That is why 3.3.2 is `partial`, and it is correct.

**The untested half is the word "or".** The criterion is "Labels OR INSTRUCTIONS", and our rule reads the
control's NAME only. A nameless field preceded by a visible instruction — F82's phone-number case is the
inverse — is asserted as a failure on evidence that only covers labels. Weak in practice: a
screen-reader user meeting a bare "edit" has no label whichever way the instruction is presented. Stated
rather than fixed.

## 4.1.2 Name, Role, Value — ONE FINDING

> "For all user interface components ... **the name and role can be programmatically determined**; **states,
> properties, and values that can be set by the user can be programmatically set**; and **notification of
> changes** to these items is available to user agents, including assistive technologies."
> — [Understanding 4.1.2](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value)

The criterion has THREE clauses. We cover the first (unnamed control, rules, exact on 147 records) and the
third (state change never announced). `criterion-coverage.ts` says "two of three failure modes are
covered", and its third is "a role-less `<div onclick>`" — which is a mode of the FIRST clause, not a
third clause.

**FINDING — the settability clause is absent from our enumeration.** "States, properties, and values that
can be set by the user can be **programmatically set**" is about assistive technology being able to WRITE,
not only read. Nothing here tests it, and the three-mode framing does not say so, so the entry reads as
covering more of the criterion than it does. Our `unnamed-control` maps to F68 exactly; the settability
clause has no rule and no acknowledgement.

## The four `secondary` PARTIAL criteria — 2.1.1, 2.4.1, 2.4.2, 2.4.3 — ALL CLEAN

Audited together because they came out the same way, and the way is the finding. Each rule's last
assumption names the gap between what it observes and what the criterion asks, and maps `secondary`
because of it:

| | the criterion | what the rule says |
|---|---|---|
| **2.1.1** | "operable through a **keyboard interface**" | "SECONDARY because 2.1.1 covers operation by any keyboard interface, and only Tab is pressed here. A control reachable by arrow keys [conforms]" |
| **2.4.1** | a mechanism to bypass blocks — H69 and ARIA11 are sufficient | "A skip link is NOT required by 2.4.1 — headings alone satisfy it (H69) and landmarks alone satisfy it (ARIA11) — so this rule never fires on its absence" |
| **2.4.2** | titles that "describe topic or purpose" | "SECONDARY because ... whether a given title does so is human judgement. This rule proves only that the title no longer describes the content on screen, which is a sufficient failure and not the whole criterion" |
| **2.4.3** | an order that "preserves **meaning and operability**" — W3C: "Focus order does not necessarily need to follow the visual presentation" | "SECONDARY because 2.4.3 asks whether an order preserves MEANING, which is human judgement" |

2.4.1's is the sharpest, because it is the one that would have produced a false accusation on nearly every
page: detecting a MISSING skip link. W3C's Sufficient Techniques list H69 and ARIA11 as alternatives, and
the rule fires only on a skip link that is present and inert — "which is the part no markup inspection can
reach: a checker sees a link and a plausible fragment href and passes the page."

## What the ten ASSESSED criteria came to

| criterion | verdict |
|---|---|
| 1.1.1 Non-text Content | five of six exceptions unstated; Controls/Input can bite |
| 1.3.1 Info and Relationships | **clean** |
| 1.4.2 Audio Control | **clean** |
| 2.4.4 Link Purpose (In Context) | **clean** |
| 2.4.6 Headings and Labels | covers headings, criterion says "headings AND labels" |
| 3.2.1 On Focus | **asserts** on a title change; three findings |
| 3.2.2 On Input | same rule, same three |
| 3.3.1 Error Identification | note described a page that may conform; entry self-contradicted |
| 3.3.3 Error Suggestion | **asserts** against two normative exceptions |
| 4.1.3 Status Messages | one of four categories; channel choice right for a subtle reason |

**Three clean, seven with findings, and the pattern is not what I predicted.** After the first four I
wrote that the rest would be documentation correction rather than rule correction. Wrong: **two rules
ASSERT conformance failures against pages the criterion says conform** — 3.3.3 on "Incorrect password",
and 3.2.1/3.2.2 on any title change.

**Why none of this was caught by the existing gates.** Both asserting rules read probe-gated channels,
and `probeForms`/`probeFocusContext` are off for real-page captures — so `rules:real-pages` reports zero
findings for them **by construction**. The 86 conformant pages that clear every run say nothing about the
two rules most able to accuse wrongly. That is the "a gate that does not exercise what ships" shape, and
it is the reason this audit had to be reading rather than measurement.

**The one thing that recurred in every clean criterion**: the rule's `assumptions` quote the part of the
criterion it cannot reach, and the mapping is `secondary` because of it. Every finding is the absence of
that — an exception unquoted, a condition unguarded, a note describing something other than what the
criterion says.

## The result: 17 of 17 criteria that carry a claim

**9 clean, 8 with findings.** Every rule that can ASSERT has been read against its criterion.

| | |
|---|---|
| **clean** | 1.3.1, 1.4.2, 2.1.1, 2.1.2, 2.4.1, 2.4.2, 2.4.3, 2.4.4 — and 3.3.2's bound |
| **findings, referring** (`secondary`, so a misread yields `cantTell`) | 1.1.1, 2.4.6, 3.3.1, 4.1.2, 4.1.3 |
| **findings, ASSERTING** (`conformance`, so a misread accuses) | **3.3.3**, **3.2.1 / 3.2.2** |

**The single pattern.** Every clean criterion is clean the same way: the rule's last assumption quotes the
part of the criterion it cannot reach, and the mapping is `secondary` because of it. Every finding is the
absence of that — an exception unquoted, a condition unguarded, a note describing something other than
what the criterion says. Nothing here was a rule computing the wrong thing; it was rules claiming more
than they had read.

**Why no existing gate could have found any of it.** The two asserting rules read probe-gated channels,
and those probes are off for real-page captures — so `rules:real-pages` reports zero for them BY
CONSTRUCTION. The 86 conformant pages that clear every run say nothing about the two rules most able to
accuse wrongly. `rules:gate` scores the corpus, and the corpus was built from the same readings being
audited, so it cannot disagree with them either. This had to be reading.

**BOTH WERE FIXED 2026-09-04, and they were not decisions.** I recorded them as product decisions — "changing
what the product ASSERTS is a decision, not a tidy-up" — and that was wrong twice over. CLAUDE.md already
states the test, and it is mechanical: the seven `secondary` subtypes are so *"deliberately, BECAUSE THEY
INFER THE FAILURE WHERE THE FOUR READ IT DIRECTLY."*

Apply it. `error-announced-without-remedy` READS "no instruction in the announcement" and ASSERTS "a known
suggestion was withheld". `context-change-without-action` READS "two titles differ" and ASSERTS "the
context changed", which the criterion's own note says does not follow. Both infer. Both are now
`secondary`.

Nothing else moved: each fires on the same evidence, stays rules-owned, and still reaches the report — as
`cantTell`, a moment worth a human's attention, rather than as a conformance failure the criterion may not
agree with. `act-rules.test.ts` pins the asserting list precisely so this is a visible edit, and it forced
one.

## Still to audit

| status | criteria |
|---|---|
| `assessed` | **ALL 10 DONE** — 1.1.1, 1.3.1, 1.4.2, 2.4.4, 2.4.6, 3.2.1, 3.2.2, 3.3.1, 3.3.3, 4.1.3 |
| `partial` | **ALL 7 DONE** — 2.1.1, 2.1.2, 2.4.1, 2.4.2, 2.4.3, 3.3.2, 4.1.2 |
| `reachable` (4) | 1.3.5, 2.1.4, 2.5.3, 3.1.1 |
| `out-of-scope` (33) | their REASONS are claims too. Lowest priority: a misread there produces a finding we never make, not one we make wrongly. |

**What the first four suggest about the rest.** Three of four were clean, and the clean ones were clean
for the same reason: the rule's `assumptions` quote the part of the criterion the rule cannot reach, and
the mapping is `secondary` because of it. Both findings are in prose that drifted from the code — an
unstated exception, and a note contradicting its own entry — rather than in a rule that fires wrongly. So
the likely shape of the remaining work is DOCUMENTATION correction, not rule correction. That is a
prediction, and the point of writing it down is that the remaining criteria can refute it.
