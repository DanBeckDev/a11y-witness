# 0024 — A form is configured with STATES, not values

**Status:** accepted, 2026-09-02
**Supersedes nothing. Unblocks:** `known-gaps.md` §21 (4.1.3 real-page grounding), and 3.2.2's
`realPageEvidence: false`.

## Context

Four criteria cannot be assessed on a page we do not own, because the evidence only exists once a form has
been submitted or typed into: **3.3.1** Error Identification, **3.3.3** Error Suggestion, **4.1.3** Status
Messages, **3.2.2** On Input. `probeForms` and `probeTyping` are therefore OFF in the CLI and — for
`probeTyping` — off everywhere, since pressing *Book* on somebody's production site is not a review.

That is the right consent line and it has always been stated as a limitation. It is also solvable, because
the thing that makes submitting a form acceptable is **the site's owner telling us what to put in it**.

Two designs were considered and one of them is a trap.

| | |
|---|---|
| **values plus a submit button** — fill these fields, press that button | reintroduces a guess. "Submit empty to hear an error" is a PROXY for producing an error, and on a real form it is often wrong: the field may be optional, the button may be disabled until valid, validation may be client-side and never announce at all. The tool would then report silence without being able to say what it expected to hear |
| **named states** — here are the scenarios this form can be in | the site's owner already knows what their form rejects. Declaring it removes the guess AND makes the destructive act separately consentable |

## Decision

**A form is configured with named states.** Each is a scenario the tool can drive and listen to, and
each carries the author's own statement of why it is that scenario.

```yaml
version: 1
origin: https://booking.example.com     # refuses to apply anywhere else

forms:
  - form: "Book a room"                 # the form's ACCESSIBLE NAME
    submit: "Confirm booking"
    states:
      - state: error
        because: "no email address"     # what you expect to be rejected, in your words
        fields:
          - field: "Email address"
            value: ""
      - state: success
        fields:
          - field: "Email address"
            value: "ada@example.test"
          - field: "Room type"
            choose: "Double"            # the verb matches the control
          - field: "I accept the terms"
            check: true
```

Five decisions follow, and each was settled deliberately.

**1. Fields are addressed by ACCESSIBLE NAME, never by selector.** This is the decision everything else
rests on. Playwright moved to `getByLabel`/`getByRole` for robustness; here it is also the only choice
consistent with what this tool is, and it pays a dividend no selector-based design can:

> **A field that cannot be addressed by its accessible name is a FINDING, not a configuration error.**
> If the config cannot bind `"Email address"` because the input has no name, that IS the 4.1.2 failure —
> a screen reader user cannot address it either. The binding failure and the accessibility failure are
> the same fact, so the config is a probe in its own right.

`structure.formFields` already carries the announced names, so nothing new has to be measured.

**2. A `success` state is the licence to complete the form.** Its absence is an instruction, not a gap
in the tool, and the report says so rather than assuming. This is the whole answer to form side effects:
consent attaches to the specific dangerous operation instead of to forms in general.

**3. "Properly tested" becomes computable.** Each criterion declares the states it needs, so
configuration completeness is a reported fact:

| criterion | error state | success state |
|---|---|---|
| 3.3.1 Error Identification | required | — |
| 3.3.3 Error Suggestion | required | — |
| 4.1.3 Status Messages | partial | partial — an error status announced does not prove a success status is |
| 3.2.2 On Input | either | either — it needs typing, not submitting |

So a config carrying only an error state reports `4.1.3 PARTIAL`, naming the state that was missing.
Three outcomes stay separate that today collapse into one: **not configured** (the user's to supply),
**configured and observed** (assessed), **configured and unbindable** (a finding about the page).

**4. ONE CAPTURE PER STATE.** Forced, not chosen: an error submission leaves a dirty form and an error
banner, and a success submission may navigate away — which `probeFormSubmit` already records as
`navigatedOnSubmit`. Each state therefore needs a fresh page load. It is also the cheaper option
architecturally, because the evidence channels stay FLAT ARRAYS and none of the 28 files that read
`interaction.*` as a bare array has to change. Nesting per-state evidence inside one capture would
reshape them all.

**5. The config and the state name are CAPTURE-CACHE INPUT.** Filling a form differently produces
different evidence, so the config hash and the state join `captureOptions` — the same reasoning that
keeps `browser` in the key.

## The draft is generated, and that is what makes it easy

Nobody writes this file from scratch. `--emit-form-config` reads `structure.formFields` and emits the
skeleton with values blank — and it is where disambiguation is solved, because **the easiest API for a
name collision is one the user never writes**:

```yaml
      - field: "Address line 1"
        within: "Billing address"   # DRAFTED: two fields share this name
        value: ""                   # TODO

      # UNNAMED FIELD, 3rd in reading order. NVDA announced "edit" with no name.
      # This tool cannot address it and neither can a screen reader user.
      # Reported as 4.1.2 whether or not you configure this form.
```

Scoping by group is how a screen reader user tells two `"Address line 1"` fields apart, so `within:` is
the primary form and `nth:` is the fallback where there is no group to name. **The draft is already an
accessibility report** — a user who never fills it in has still learned something.

## Consequences

**`probeTyping` stops being unreachable, without a separate decision.** 3.2.2 asks whether entering data
changes context, and filling a field IS typing into it. We type the user's own value, into the field they
named, at their instruction — so consent is not a second question and it costs no extra keystrokes.

**An error state is NOT a safe state, and the documentation must not imply it.** A rejected submission
still fires analytics, may rate-limit, may lock an account after N attempts, may alert a human. Less
destructive is not non-destructive.

**CI repeats this forever.** Two states on every push is the number nobody computes in advance. The docs
lead with staging, and `origin:` pinning is what stops a staging config being aimed at production.

**Repeated submissions trip bot detection**, and a CAPTCHA appearing mid-capture reads exactly like a
broken page — this repo's most expensive recurring shape arriving through a new door. It needs its own
diagnostic rather than a mysterious silence.

**Nothing is discovered implicitly.** `--forms <file>`, explicit, no auto-discovery: one implicit config
cannot express more than one scenario, and submitting data should be visible in the workflow file.
`--plan` prints what would be submitted, to which origin, and which state completes the form, without
submitting anything.

**Guards:** values are never logged (field NAMES are evidence, values are not); the schema says this is
not a credential store, or people will put passwords in it; an unbound field name is reported rather than
skipped, because silently ignoring it is the empty-channel defect wearing a new hat.

## Scope

**v1 is single-page forms.** Multi-step flows — a wizard, a checkout — need a step list, which turns a
declarative file into a script and is where Playwright ends up. That is v2 and it is a different design.

## Rejected

**Auto-discovery of `a11y-witness.forms.yml`.** Friendlier, and it cannot express two scenarios for one
page. Explicitness is also the safer default for an operation that writes to somebody's system.

**Submitting empty as the error case.** The proxy this ADR exists to remove. It stays as the behaviour
when no config is supplied, because it is the only thing available then — but it is no longer what the
tool claims to be testing when a config exists.
