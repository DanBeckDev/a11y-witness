# ADR 0018 — A placeholder-only label is not witnessable by a screen reader, and belongs to axe

**Status:** accepted, 2026-08-23
**Depends on:** ADR 0015 (one defect per page taught the scorer to veto), ADR 0017 (a rule must report the criterion it decides)

## Context

`3.3.2:placeholder-only` — a form field whose only label is its `placeholder` attribute — was a trained head
in the scorer, and `criterion-coverage.ts` recorded 3.3.2 as fully `assessed`.

It cannot be assessed from screen-reader evidence. **When a field has no label, the browser uses the
placeholder as its accessible name**, so NVDA speaks it exactly as it speaks a real label:

```html
<input placeholder="Email address">              NVDA: "Email address, edit"
<label>Email address</label><input>              NVDA: "Email address, edit"
```

Identical words, identical order. Nothing in the announcement says where the name came from. The harm to a
real user is real — a placeholder **disappears when you start typing**, so tabbing away and back loses the
label — but it is invisible to anyone listening, because at the moment of listening it sounds correct.

**This is axe-core's job.** A DOM scanner sees the missing `<label>` in one pass. `CLAUDE.md`'s opening
paragraph already says this tool "sits **alongside** axe-core (the rule/visual layer), not instead of it",
and this criterion is squarely on axe's side of that line. Attempting it here was a category error rather
than a gap to close.

### What the head was actually doing

Measured on held-out acceptance, 2026-08-23: **eight false accusations on four conformant pages.**

- **There is no placeholder feature in the system at all.** The head decided from the frozen embedding: its
  weight mass is **598.9 across 384 encoder dimensions against 9.26 across every document feature combined**,
  and its five strongest document features are `state_unchanged`, `filename_graphic_present`,
  `generic_graphic_present`, `transcript_present`, `heading_present` — not one of them about labels.
- **It had learned the corpus's placeholder WORDING.** It fired on **4 of the 6** clean pages containing the
  string `"Example value"` and **0 of the 34** without it. That is ADR 0015's shortcut mechanism exactly: the
  corpus made the property look separable because its conformant pages carry a label *and* a placeholder, so
  both get announced. Compare the broken page to a correctly-labelled field with no placeholder and the
  shapes are identical.

### Why it took three attempts to see

Recorded because the wrong turns cost more than the fix. Two remedies were tried against the *wrong head* —
`3.3.2:unnamed-form-field`, which turned out to be doing a job the rules already did 115/115:

| attempt | result |
|---|---|
| raise `form_field_named`'s multiplier 2.0 → 6.0 | inert — the head learned a weight a third the size and the effective contribution was unchanged. **Scaling an input cannot strengthen a relation in a linear head.** |
| pool by `instance-max` instead of `document-mean` | no change — both pool over a bag that genuinely contains a bare-`edit` announcement |
| make the rule report 3.3.2 (ADR 0017) | correct and worth doing, but never the cause of these eight |

The failing subtype was named in the acceptance report the whole time. `npm run scorer:explain
--criterion=3.3.2` prints it in one line, and it was written the same afternoon and not used.

## Decision

1. **`3.3.2:placeholder-only` is `decidedBy: "unavailable"`** in `rule-ownership.json` — the third state,
   the same as `4.1.2:missing-role`, meaning the model is not trained on it because the evidence cannot
   express the failure.
2. **3.3.2 is `partial`, not `assessed`.** One of its two modes is covered and exact: a field with no label
   at all announces a bare role, and the rules decide that 115/115. The placeholder mode is not covered and
   the documentation says why, and says which tool does cover it.

## Consequences

- **We stop claiming something we cannot detect.** That is a reduction in advertised coverage and an
  increase in what the coverage claim is worth.
- **Eight false accusations go.** A false positive is an accusation someone may budget against or be
  challenged over; removing a whole class of them by declining to guess is the right trade.
- **The corpus keeps the cases.** They are valid pages and valid labels; what changes is that no head is
  trained to guess at them. `check-signals` still requires the signal to discriminate, because the signal
  knows the placeholder text — the corpus can express what a screen reader cannot hear, and that asymmetry
  is the whole finding.

## The general rule this earns

**Before building a detector, ask whether the evidence can distinguish the two cases at all.** Not whether a
model can learn it on our corpus — a corpus can leak the answer, and this one did, through a placeholder
string. Ask whether two pages that differ *only* in the property produce different announcements.

Two mechanical checks now exist for the class:

- **Does a head have any feature relevant to its own criterion?** A placeholder head whose strongest signals
  are about graphics is guessing, and that is detectable without a human reading weights.
- **How lopsided is a head's encoder-to-document weight ratio?** 65:1 here. A head that ignores the explicit
  relations we extract is deciding on text similarity, which is exactly where shortcuts live.

## What would falsify this

If NVDA (or another screen reader) is found to announce a placeholder-derived name differently from a real
one — a distinct role, a different order, any marker at all — the criterion becomes witnessable and the
decision should be revisited. Nothing in the 2,122-capture corpus shows such a marker.
