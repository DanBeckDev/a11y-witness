# ADR 0017 — A rule that decides evidence must report every criterion that evidence fails

**Status:** accepted, 2026-08-23
**Depends on:** ADR 0015 (one defect per page taught the scorer to veto), and `rule-ownership.json`, which declares who decides what

## Context

`3.3.2:unnamed-form-field` was declared `decidedBy: "rules"` and the rules decided it **115/115**. But the
rule reported the finding as **4.1.2** only, so nothing in the system ever emitted a 3.3.2 finding for it.

`train-screenreader-model.py` noticed, and its comment states the problem exactly:

> Marking it rule-owned gave it the worst possible pair of properties: load-bearing in production (the judge
> correctly declines to suppress it) while exempt from the release gate.

So the trainer kept a head for the subtype — correctly, given the rule said nothing about 3.3.2 — using this
condition:

```python
RULE_SUBSTITUTED_SUBTYPES = frozenset(
    subtype for subtype, entry in RULE_OWNERSHIP.items()
    if entry["decidedBy"] == "rules" and subtype.startswith(entry["reportsAs"] + ":")
)
```

The condition is right and it is a **symptom**. `3.3.2:unnamed-form-field` fails it because `reportsAs` is
`4.1.2`, and the whole reason that mismatch exists is that the rule reports a different criterion from the
one the corpus labels.

### What the head cost

Measured on the held-out acceptance set: **eight false accusations on four conformant form pages**. A clean
page and a broken one announce nearly the same thing —

```
CLEAN                                   BROKEN
  form, Company name                      form, Company name, edit,
  edit, Example value        <- bare      Company name, edit,
  Company name, edit, Example value       edit                <- bare
```

— both contain a bare-`edit` announcement, so the frozen embedding cannot separate them. The engineered
features *can*: `form_field_named=1.0` on the clean page, `0.0` on the broken one. They lose anyway, because
the head weighs 384 encoder dimensions (Σ|w| = 248.0) against 29 document features (Σ|w| = 5.98).

**Two remedies were tried first and both failed, which is what makes the third one a decision rather than a
guess.**

| attempt | result | why |
|---|---|---|
| raise `form_field_named`'s multiplier 2.0 → 6.0 | no change (and 2 new misses) | the head learned a weight a third the size (−0.2316 → −0.0717); effective contribution unchanged (−0.4632 → −0.4303). Scaling an input cannot strengthen a relation in a linear head — gradient descent compensates. **This applies to every entry in `ENGINEERED_FEATURE_MULTIPLIERS`.** |
| pool by `instance-max` instead of `document-mean` | no change at all | both pool over a bag that genuinely contains a bare-`edit` announcement, so both fire. Pooling was never the cause. |

## Decision

**The rule reports 3.3.2 as well as 4.1.2 when the unnamed control is an INPUT.**

- An unnamed **input** fails both: 4.1.2 has no accessible name, and 3.3.2 has no label — the user is asked
  to enter something and not told what. W3C describes this failure as a screen reader announcing
  *"edit text"* with no indication of the field's purpose, failing 1.3.1, 3.3.2 and 4.1.2 together.
- An unnamed **button** stays 4.1.2 alone. There is no label to be missing, only a name. Conflating them put
  four conformant ICON pages into 3.3.2 when this was prototyped as a rule over the existing features.

With the rule reporting the criterion, `3.3.2:unnamed-form-field` becomes genuinely rule-substituted, the
head is no longer the only thing that can produce that finding, and the eight false accusations go with it.

### The claim is bounded, and the bound is real

A control **can** pass 4.1.2 with an `aria-label` and still fail 3.3.2, when no label is visible to sighted
users. A screen-reader transcript cannot see that case — the name is announced either way. So this rule
witnesses *"no name at all"* and says nothing about the partial case. `criterion-coverage.ts` records 3.3.2
as PARTIAL for that reason, which is the same honesty ADR 0010 applies elsewhere: name the failure mode you
cover and the one you do not.

## Consequences

- **A false accusation is worse than a miss**, and this trades none for eight. That asymmetry is the
  project's standing rule: a false positive is an accusation someone may budget against or be challenged
  over.
- **The general lesson, which outlives this criterion.** A rule that decides a subtype must report every
  criterion that subtype fails, or the declaration and the behaviour disagree — and the disagreement is
  invisible, because both halves look correct in isolation. `reportsAs` being a single value is what allowed
  it: one rule, one reported criterion, while one piece of evidence can fail several.
- **Two negative results are recorded in the source**, at the multiplier and at the pooling set, so nobody
  repeats them. The multiplier one is the more valuable: it means the mechanism is inert generally.

## What would falsify this

- **If a page appears whose input is announced with a name it does not visibly have**, the 3.3.2 claim would
  be wrong on that page and the bound above becomes a real exposure rather than a stated limit.
- **If the trained head turns out to add findings the rule misses** on a wider corpus, the head should come
  back rather than the rule be widened — the rule is exact where it applies and silent elsewhere, which is
  the property being bought here.
