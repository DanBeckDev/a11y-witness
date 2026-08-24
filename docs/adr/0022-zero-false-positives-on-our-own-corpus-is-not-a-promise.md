# 0022 — Zero false positives on our own corpus is not a promise

**Status:** accepted 2026-08-24

## Context

Every head in the training report read `precision 1.000`. It looked like thirteen pieces of evidence.
It was one tautology, printed thirteen times.

`choose_threshold` picked the lowest cut on a 0.05 grid at which the head produced **zero false
positives on the development set**, and `development.precision` was then computed with that same cut on
those same out-of-fold scores. So precision was 1.000 *by construction* whenever calibration succeeded.
The number could not be wrong, which is another way of saying it could not be informative.

Three consequences, all measured on 2026-08-24 and none of them visible from the report:

**1. The cut was pinned by a single record.** Zero-false-positives over ~1,900 negatives puts the
threshold at the maximum negative score — an extreme order statistic — and then rounds it up to a
0.05 grid. Removing one link-text feature moved `3.3.1:validation-error-silent` from 15 missed findings
to 24:

```
   thr    TP   FP   FN   recall
   0.85   108    5   13   0.893
   0.90   105    1   16   0.868     <- ONE conformant record sits here
   0.95    97    0   24   0.802     <- so the cut jumps, and 8 findings go with it
```

The head separates 105 of 121 positives above 0.90 with one negative up there. Nothing about it
weakened. It reads exactly like the model getting worse, and the two need opposite responses — go and
read one record, versus retrain.

**2. The contrapositive was being misread.** Precision below 1.000 cannot mean "slightly over-eager".
It can only mean the fallback fired — no cut anywhere on the grid separated the head at all.
`1.3.1:unassociated-table` reporting "2 false positives at threshold 0.5" was a head that **cannot be
calibrated**, filed as a minor blocker.

**3. The fallback was the cut that accuses most.** It returned a fixed 0.5, which its own docstring
called "a value nobody chose". On the three heads where calibration failed: `2.1.2:focus-trapped` 36
false positives at 0.5 against **4** at 0.95; `2.4.2:route-title-stale` 6 against **2** at 0.75 *at
identical recall*, so 0.5 was strictly dominated; `1.3.1:unassociated-table` 2 against **1** at 0.55.
Reporting a bad default loudly is not fixing it.

## What the literature says, because this is a solved problem

Tong, Feng & Li, *Neyman-Pearson classification algorithms and NP receiver operating characteristics*,
**Science Advances 4(2), 2018** (`arXiv:1608.03109`; R package `nproc`). Proposition 1: with `n`
held-out class-0 scores `s₍₁₎ ≤ … ≤ s₍ₙ₎` and classifier `1(score > s₍ᵣ₎)`,

```
P[population type I error > α]  ≤  v(r) = Σ_{j=r}^{n} C(n,j)(1−α)^j α^(n−j)
                                  r* = min{ r : v(r) ≤ δ }
minimum sample size:              n ≥ log δ / log(1−α)
```

The paper's central warning names our procedure: choosing a cut so the **empirical** type-I error meets
a target leaves the **population** error above target *roughly half the time* — and they test
cross-validation explicitly and find it *"still only about half"*. Our scores are out-of-fold, so being
cross-validated bought us nothing on its own.

**We were not committing that error, and it is worth being precise about why.** Their failure mode
targets a nonzero empirical α. We targeted zero, which is `r = n`, the most conservative order statistic
there is and a legitimate NP choice. Computed from the real report, our old cuts held **population
false-positive rate ≤ 0.16% at 95% confidence, distribution-free**.

So the defect was never missing control. It was that we could not state our own guarantee, and were
paying a great deal for one far tighter than the product needs.

## Decision

**Choose the threshold as a Neyman-Pearson order statistic of the held-out negative scores, calibrated
to α = 0.005 at δ = 0.05** — population false-positive rate ≤ 0.5%, with 95% confidence. Report the
guarantee per head. Delete the grid.

α = 0.005 is ten times stricter than the paper's default. It is affordable because of **who errs**, and
that is ADR 0021's division doing real work:

| | |
|---|---|
| **rules** | ASSERT (`failed`). Deterministic, carry **no threshold at all**, unaffected by this ADR. 0 false positives across 1,183 conformant records. |
| **model heads** | REFER (`cantTell`). A false positive costs a human a look at a page that turns out fine. |

α is therefore a referral rate, not an accusation rate. Nothing here loosens what the tool *states*.

Measured cost of the old conservatism, on the model-decided heads:

| head | zero-FP cut | @α=0.005 |
|---|---|---|
| `1.3.1:fake-heading` | 0.868 | **0.945** |
| `4.1.3:form-activation-silent` | 0.858 | **0.921** |
| `3.3.1:validation-error-silent` | 0.802 | **0.868** |
| `1.1.1:generic-alt` | 0.923 | **0.954** |
| `1.3.1:unassociated-table` | 0.967 | **0.975** |

Every head has 1,857–2,016 held-out negatives against the **598** α=0.005 requires.

## Consequences

- **`development.precision` stops being the release criterion.** A bounded number of development false
  positives is now expected. The gate blocks on two things it previously could not see: a head with
  *more* false positives than its rank permits (the threshold and the scores disagree — a calibration
  fault, not a weak head), and a head with too few negatives to reach the target at all.
- **Recall becomes an outcome rather than a trade.** The cut is a statistic of the negative scores
  alone; positives play no part in choosing it. That is what makes the bound hold without assuming
  anything about how failures are distributed.
- **The guarantee is the CV approximation, not the exact split, and the report says `exact: false`.**
  Proposition 1 assumes one scoring function and an independent class-0 sample; out-of-fold scores come
  from K fold models, so each record was scored by a model that did not see it but not all by the same
  model. This is the same gap cross-conformal methods carry against split conformal. Closing it needs
  negatives held back from training entirely — deliberately deferred, and it must not be quietly
  forgotten, because an overclaimed finite-sample guarantee would be this repo's signature defect
  dressed as rigour.
- **`nextafter` is load-bearing.** Inference compares `score >= threshold`; the proposition is stated
  for `score > s₍ᵣ₎`. Without the nudge, every negative tied at the cut counts as a positive.
- **Below the minimum sample size the head is NOT calibrated and says so**, reporting the α it actually
  bought rather than the one it was asked for. The remedy is conformant records; no threshold
  substitutes for them.
- **This does not fix a head with too few POSITIVES.** `2.1.1` has 0, `2.4.3` has 3, `2.1.2` has 4,
  `2.4.1` has 6, `2.4.2` has 7. Those need corpus, and they are all rule-decided, which is why they do
  not block. Calibration is not a substitute for evidence — the same point ADR 0015 makes about vetoes.

## What was rejected

- **Keeping zero-empirical-false-positives.** It is the strongest bound of the options (≤0.16%) and the
  reason to reject it is not the recall — it is that the threshold stays pinned to whichever single
  conformant record happens to score highest, so the instability recurs on every retrain and every
  corpus change, indistinguishably from a model regression.
- **Conformal risk control / Learn-then-Test** (Angelopoulos et al., `arXiv:2208.02814`). More general —
  it controls the expectation of any monotone loss — and that generality is not needed here. Type-I
  error is exactly the risk we want bounded, and NP states it directly with a tighter, simpler
  order-statistic result. Revisit if a future criterion needs a non-binary loss.
- **A wider grid, or interpolation between grid points.** Treats the symptom. The grid was never the
  reason the cut moved; the zero-false-positive rule was.
