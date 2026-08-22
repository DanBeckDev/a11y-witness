# ADR 0015 — One defect per page taught every head to veto on other criteria's evidence

**Status:** accepted, 2026-08-22
**Depends on:** ADR 0009 (dataset tiers), ADR 0010 (real-page calibration corpus)
**Corrects:** ADR 0010's inference about why real inaccessible pages score badly, and RELEASE.md's
description of the one missed page.

## Context

The question was narrow: why does the trained scorer find nothing on `before/tickets.html`, one of the
three publisher-declared inaccessible pages in the calibration set? The answer is not about that page,
and it is not about the abstention floor. It is about how the whole corpus is built.

### The measurement that started it

All three W3C BAD `before` pages carry exactly one form control, and it is byte-identical on all three —
the unnamed navigation combo box in the site chrome the pages share:

```
form-navigation: combo box, collapsed, QUICKMENU ---- greater
```

The matching `after` pages carry the same widget correctly named (`"Explore Site by Topic:, combo box"`).
`4.1.2:unnamed-control` is instance-max pooled, so its score is the score of its best single announcement.
Scored with the shipped weights, that identical announcement gives:

| page | winning unit | score | threshold 0.9 |
|---|---|---|---|
| `before/news.html` | `form-navigation: combo box, collapsed, QUICKMENU ---- greater` | **0.924042** | finding |
| `before/template.html` | *the same string* | **0.924042** | finding |
| `before/tickets.html` | *the same string* | **0.452519** | silent |

The same announcement, scored three ways. The first two agree to sixteen decimal places, which is what
identical input looks like. The third does not, so something outside the announcement is being read.

## Three whys

**1. Why is the score 0.45 on `tickets` when the evidence is identical?**

Because the head's input is 413 features: 384 encoder dimensions of the announcement, plus **29
document-level engineered features of the whole capture**. Three of the 29 differ between these pages, and
all three are about tables — `tickets` is a 2005-era layout built from 14 nested `<table>`s:

```
                              news  template  tickets
table_present                    0         0        1
table_data_row_present           0         0        1
table_position_only              0         0        1
```

Their learned weights are −1.26, −1.27 and −1.34 logits. Ablation, on the real captures with nothing else
changed:

```
news      as captured 0.924042   table features zeroed 0.924042   (already 0 — unchanged, as it must be)
template  as captured 0.924042   table features zeroed 0.924042
tickets   as captured 0.452519   table features zeroed 0.975202   <- 0.45 -> 0.98, across the threshold
```

**A page that contains a table cannot be reported as having an unnamed control.** That is causal, not
correlational — the intervention is on the feature vector and everything else is held fixed.

**2. Why did the head learn a penalty for tables?**

Because it never paid for it. Measured over the training corpus on disk, of the **147 records that carry
`form_field_unnamed = 1`** — the evidence this head exists to judge:

```
                     4.1.2:unnamed-control POS   negative
table_present = 0                          147          0
table_present = 1                            0          0
```

**Not one training record has both a table and an unnamed control.** Perfect separation, so `table_present`
is a *free* negative feature: using it costs nothing on training data and nothing on a held-out split of
that same data, because the held-out split has the same structure. No accuracy metric we compute can see
it. The synthetic generator produces one defect per case family, so a table page is a table case and never
carries a form defect.

**3. Why does this matter far beyond one page?** Because the same shape appears in a feature that occurs on
almost every real page. `form_field_named` is also 0 on all 147 positives, and it carries **−4.33 logits**.
Adding one properly named field to `before/news.html`'s capture — leaving the unnamed combo box exactly as
it was, `form_field_unnamed` still 1 — gives:

```
  0.924042  FINDING   as captured (one unnamed combo box, nothing else)
  0.168768  silent    + 1 properly named field alongside it
  0.168768  silent    + 2 named fields
  0.168768  silent    + 4 named fields
  0.938972  FINDING   the +1 variant again, with form_field_named ablated to 0
```

**The scorer can only report an unnamed control on a page where no control is correctly named.** A real
site with a search box and one broken widget is silent. The reason this defect has been invisible is that
the only real pages it has ever been measured on are three copies of a 2005 demo whose single form control
is the broken one.

*(The named-field measurement edits a capture, so it is a probe rather than an observation. The ablation on
the unedited page is the independent confirmation, and it isolates `form_field_named` alone.)*

### It is systemic — 225 veto pairs across all 13 heads

Audited across the corpus: a feature that is **0 on every positive of a subtype**, present on ≥50 records
corpus-wide, and given a weight ≤ −1.0 logits.

```
subtype                            pos  vetoes  sum logits  worst
1.1.1:filename-alt                  31      19      -36.30  vague_link_present (-4.40)
1.1.1:generic-alt                   31      19      -36.51  vague_link_present (-4.45)
1.1.1:missing-alt                   88      18      -32.40  vague_link_present (-4.35)
1.3.1:fake-heading                  26      21      -38.17  vague_link_present (-4.41)
1.3.1:unassociated-table            61      12      -27.17  table_header_associated (-6.80)
2.4.4:regex                        100      18      -30.32  generic_heading_present (-3.86)
2.4.6:regex                        100      18      -30.97  vague_link_present (-4.24)
3.3.1:validation-error-silent      125      15      -30.59  plain_heading_candidate_present (-3.71)
3.3.2:placeholder-only              26      21      -49.78  form_field_unnamed (-5.29)
3.3.2:unnamed-form-field           115      16      -25.87  form_field_named (-4.51)
4.1.2:state-change-silent           69      18      -36.31  state_changed (-6.48)
4.1.2:unnamed-control              147      17      -28.68  form_field_named (-4.33)
4.1.3:form-activation-silent       125      13      -30.29  status_update_announced (-4.50)
```

Every head has learned a dozen or more rules of the form *"if another criterion's evidence is present, this
is not my defect"*. On a corpus where each page demonstrates one thing, that is true. On a real page, which
fails several ways at once and carries every other criterion's evidence besides, it is false — and it fails
**silently, toward a clean report**, which is the direction that produces a false assurance rather than a
false accusation.

### What this corrects

- **ADR 0010** attributed real inaccessible pages' distance from the training distribution to their failing
  "in several ways at once". That may be true of the *novelty* score. It is not the reason for the miss;
  the miss is a learned veto, and the mechanism is measured above.
- **RELEASE.md** describes the missed page as W3C's *"purchase form, broken"* demo. `before/tickets.html`
  has **no form**: 0 `<form>`, 0 `<input>`, 1 `<select>`, 14 `<table>`, 0 `<label>`, 0 `<button>`, no ARIA
  (measured live 2026-08-22). The purchase form is on `survey.html`. The corpus entry was mislabelled and
  is corrected.
- **"2 of 3 inaccessible pages caught"** is one defect observed three times, in one template's shared
  chrome, on one publisher's demo. It is n=1, and it should never again be quoted as three.

### What this does NOT change

**The abstention floor was right and stays at 0.70.** `before/tickets.html` sits at novelty 0.6978, out of
support, so the tool abstains rather than reporting it. Lowering the floor to 0.65 to "catch 3 of 3" would
have scored the page and returned **no findings** — turning an honest *"I cannot assess this"* into a
confident *"nothing wrong here"* on a page its own publisher calls inaccessible. The floor is the only
thing that stopped this defect producing a false clean, and it did so without knowing why.

## Decision

### 1. A conformant page must carry other criteria's evidence, and a failing page must be allowed more than one defect

This is the root fix and everything else is mitigation. The generator's one-defect-per-family shape is what
creates the perfect separation, so the corpus must produce:

- **failing pages carrying unrelated conformant structure** — an unnamed control on a page that also has
  tables, named fields, good headings and descriptive links;
- **conformant pages carrying the same structural richness**, so a feature cannot separate the classes.

The target is that **no engineered feature is constant across a subtype's positives.** That is a property
of the corpus, checkable without training anything, and it is the condition under which held-out accuracy
means what it appears to mean.

### 2. The veto audit is a gate, not an observation

`npm run scorer:shortcuts` reports the table above and **fails on regression** against a recorded baseline.
It needs no worker, no capture and no retrain — the corpus on disk and the shipped weights are enough.

This is the repo's own rule that a caught-and-logged error is not a handled error, applied to a model: 225
free vetoes were derivable from files in the repository at any point in the last month and nothing computed
them. Every accuracy number we have — held-out acceptance 58 TP / 0 FP / 0 FN, eval, `rules:gate` — is
blind to this by construction, because they all evaluate on data with the same structure.

### 3. State the operating limitation in RELEASE.md now, ahead of the fix

The retrain is not the blocker; the corpus change is, and it is days of capture. Until then any real-page
claim must say: **the scorer reports an unnamed control only on pages where no control is correctly named,
and not at all on pages containing a table.** That is a narrow enough envelope that a stranger running this
on their own site deserves to be told before they read a clean report.

### 4. Corpus growth is selected on witnessability, and counted in defects

Secondary to the above but decided here, since both came out of the same investigation:

- A page joins the real corpus only if its published failure would fire a criterion in `SCORED_CRITERIA`
  **through a probe we actually run**. `before/tickets.html`'s real failures are layout tables and missing
  structure — `probeTables` is off for pages we do not own, and layout-table misuse is not in the head set.
  It was never a fair test in either direction.
- Real-page recall is reported as **distinct defects**, never page counts, with templated sites counted
  once.

### 5. The training role's all-conformant composition is asserted, not assumed

All three publisher-declared inaccessible pages are in **calibration**; the 55-page training role is 100%
conformant. Pinned in `real-page-corpus.test.ts` so adding a training-role failing page is a deliberate,
visible act.

## Consequences

- **A retrain on the current corpus will not fix this**, and should not be attempted as a fix. The vetoes
  are a faithful fit to the data; new data is the only remedy.
- **Held-out accuracy stops being sufficient evidence of quality for this project.** A metric computed on
  data that shares the flaw cannot see the flaw. The veto audit is the check that does not.
- Generating multi-defect pages makes the dataset signals harder to write, because `check-signals` proves a
  `badSignal` fires on the bad page and stays silent on the good one — and a page with two defects has two.
  That cost is real and is the price of the corpus meaning what it claims.
- Recapture. Changing what a page contains is an evidence change by definition.

## Alternatives rejected

| | why not |
|---|---|
| Drop the 29 engineered features and use the encoder alone | Throws away the features that carry the actual signal (`form_field_unnamed` is +5.37 on the head that needs it) to remove ones that carry a shortcut. The problem is the corpus, not the representation. |
| Mask the off-criterion features per head — let `4.1.2:unnamed-control` see only form features | Tempting, cheap, and it hides the fault instead of fixing it. It also requires deciding by hand which features each criterion may see, which is the judgement the training was supposed to make. Worth revisiting as a *mitigation* once the corpus fix is measured, never before. |
| Lower the abstention floor so the third page is scored | It would have scored **no findings** on it. See above. |
| Regularise the heads toward zero on structured features | Fits a coefficient penalty to a data problem, and would equally suppress the features that work. |
| Report it as a known limitation and move on | The limitation is that the flagship criterion is silent on most real pages. That is not a footnote. |

## Proved 2026-08-22 — the mechanism reverses, and it is not free

Decision 1 says the corpus must produce multi-defect pages. That is days of capture, so the cheap question
came first: **would breaking the separation actually remove the vetoes?** Two models trained from the same
data with the same trainer, differing only in composition.

`compose-multi-defect-probe.py` splices each record with a clean donor from another family — and, for the
three markers no conformant page carries (`vague_link_present`, `generic_heading_present`,
`unnamed_graphic_present`, which *are* 2.4.4, 2.4.6 and 1.1.1 failures), with a failing donor under a union
label. That gives 1,868 original + 1,868 composed records.

**Neither scratch model has the realism tier** (its input is built from real-page captures that live on the
lab), so their thresholds are not comparable to the shipped model's — RELEASE.md records that the realism
tier is exactly what moved `4.1.2:unnamed-control` from 0.05 to 0.9. A "finding / silent" verdict from
either would be meaningless. **So the measurement is threshold-free**: the three W3C BAD `before` pages
announce the identical control, so a model without the veto must score them the same.

```
  model           news  template   tickets    SPREAD    news+named     DELTA
  shipped       0.9240    0.9240    0.4525    0.4715        0.1688   -0.7553
  control       0.9509    0.9509    0.5370    0.4139        0.3481   -0.6028
  composed      0.9951    0.9951    0.9425    0.0526        0.9433   -0.0518
```

SPREAD is the same announcement scored across three pages; DELTA is what adding one properly named field
to `before/news.html` does. Both should be ~0. The **control reproduces the defect**, which is what makes
this an experiment rather than a demonstration — it is the data, not a training accident. The composed
model reduces both by about 90%, and the veto audit falls from **279 pairs to 113**, with
`1.1.1:missing-alt`, `2.4.4:regex` and `2.4.6:regex` reaching **zero**.

**It cost 8 held-out false positives on 3.3.2** (precision 1.000 → 0.429; every other criterion held at
TP 50, FP 0, FN 0 across both models). `3.3.2:placeholder-only`'s largest veto was `form_field_unnamed` at
−5.29, so removing it makes that head fire on pages with unnamed fields. Two readings, and this probe
**cannot** distinguish them:

- the veto was carrying real discriminative work, or
- spliced transcripts are not coherent pages, so the model generalises worse to real captures.

The false positives are on **unmodified acceptance records**, so it is the trained model misjudging real
evidence either way. That ambiguity is the argument for generating real multi-defect pages rather than
shipping the splice, and it is why this script is named a probe and its output must never train a shipped
model.

**Both scratch models fail the acceptance gate** on `4.1.2: fewer than 3 acceptance positives`. That is a
property of the local acceptance set, present in the control too, and unrelated to this change.

**What this settles:** the vetoes are caused by corpus composition and are removable by changing it, at a
cost that must be measured on real pages rather than assumed. Decision 1 stands and is now evidence-backed.
The next measurement is the same table after a real multi-defect capture, and `scorer:shortcuts` plus the
SPREAD/DELTA figures are how it will be read.
