# ADR 0010 — A real-page calibration corpus, and why one asset unblocks three things

**Status:** accepted, 2026-08-08
**Depends on:** ADR 0009 (dataset tiers), which specified a realism tier and did not build it

## Context

The trained scorer now **abstains on real pages**, and it is right to. Measured with a k-NN
feature-space novelty score (Sun et al., ICML 2022):

| | nearest-neighbour cosine |
|---|---|
| training records (internal) | **0.847 – 0.99**, median 0.986 |
| real eval fixtures | **0.50 – 0.84** |

**28 of 32** real fixtures fall below the corpus's own minimum. Every synthetic record has a near-twin;
no real page does. A linear head on a frozen embedding cannot tell it is extrapolating, and it returned
**0.97 and 0.99 for 4.1.2 on two conformant W3C pages**. For an accessibility tool a false positive is
an accusation someone may budget against or be challenged over, so abstention is the only defensible
answer — and it costs eval recall 90% → 59%. Those 31 points were the model guessing beyond its
competence and sometimes being right.

The corpus is synthetic and generated, so it contains the shapes we thought to generate. Real pages
carry NVDA landmark prefixes on named controls, menu buttons that do not open on focus, and structural
richness nothing in `case-matrix.mjs` produces. **This ADR's own history is the evidence:** ADR 0009
reduced page sizes from 40 links to 6 for affordability, widening the very gap that now causes
abstention, and named the realism tier as the mitigation without building it.

## The three things one asset blocks

1. **The conformal abstention threshold.** The current floor (0.847) is *derived* from the corpus's own
   nearest-neighbour minimum, not chosen — but derived is not guaranteed. The defensible form calibrates
   against a stated error rate on a held-out set *exchangeable with deployment data*, giving
   finite-sample control of the error rate among accepted predictions. The literature is explicit that
   ad hoc thresholds lack guarantees under shift. Real pages are the only valid calibration data.
2. **ADR 0009's realism tier.** Same asset, different use: training on real-page structure is what would
   let the scorer stop abstaining.
3. **Any claim about real-page recall above 59%.**

## Decision

Build a **real-page corpus, split into CALIBRATION and TRAINING roles, disjoint from the 32 existing
eval fixtures**, which stay as the test set. Calibrating or training on the test set destroys the only
independent number the project has.

### Ground truth, and why these sources

Only sources that **publish their own conformance claim**, so the label is not our judgement:

- **W3C WAI Tutorials sub-examples.** The six top-level tutorials are already used as test fixtures, so
  expansion is the sub-examples *within* them — Images (informative, decorative, functional, groups,
  complex), Tables (one header, two headers, irregular, multi-level), Forms (labels, instructions,
  grouping, validation, multi-page), Menus, Carousels, Page Structure. Each states the technique it
  demonstrates and the failure it avoids, which is the label.
- **W3C BAD (Before/After Demo).** Before pages are inaccessible with a published evaluation report;
  After pages claim full WCAG AA conformance. Four are used; the demo has more pages per variant.

Deliberately excluded: pages where we would have to decide conformance ourselves. A corpus whose labels
are our opinion cannot measure whether our tool is right.

### Roles, kept strictly apart

| role | use | must never be used for |
|---|---|---|
| **test** | the existing 32 fixtures; `npm run eval` | training, calibration |
| **calibration** | the conformal abstention threshold | training, reporting quality |
| **training** | the realism tier — teaching real-page structure | measuring anything |

`assert_disjoint` already enforces training/acceptance separation and must be extended to cover all
three.

### Capture

`DATASET_KIND=acceptance`-style: **never cached**, since the point is fresh evidence. Real URLs are
fetched by the guest, which the existing probes already do. ~30 s per capture on the healthy worker.

## Consequences

- **Until this exists, 59% recall with 0 false positives is the honest ceiling**, and `RELEASE.md` says
  so. That is a defensible position; a higher number containing accusations of conformant pages is not.
- The abstention floor stays **derived, not conformal**, and `outOfDistribution.calibration` in the
  training report states that explicitly so nobody quotes a guarantee that does not exist.
- **The error rate to defend is an input we do not yet have.** It sets the abstention rate and therefore
  how much the tool reports versus declines — a product and legal judgement, not a technical one, and it
  only becomes answerable once a calibration set exists.
- Labelling is the cost. Capture is mechanical; deciding what each page fails is the work, which is
  precisely why the sources above were chosen — they have already decided.


## Built 2026-08-09 — the corpus exists, and its first measurement confirms the premise

`packages/lab/src/training/real-page-corpus.mjs` defines 26 pages (7 calibration, 19 training) and
`capture-real-pages.mjs` captures them uncached. Roles are enforced by `real-page-corpus.test.ts`, which
derives the TEST set by reading `packages/lab/src/eval/fixtures` rather than from a copied list — a copied
list is one that goes stale the first time a fixture is added.

The 7 calibration pages captured 7/7 and were scored. Measured against the shipped support floor of 0.847:

| published claim | nearest-training cosine |
|---|---|
| conformant (`after/*`) | 0.7055 – 0.757 |
| inaccessible (`before/*`) | 0.5863 – 0.6038 |

**0 of 7 in support**, on a set disjoint from the fixtures this ADR originally measured — so the premise
reproduces independently rather than resting on one sample.

The new information is the SHAPE of the gap. The pages published as inaccessible sit measurably further
from the training distribution than the ones published as conformant (~0.59 vs ~0.73), which is the wrong
way round for us: the scorer is least at home exactly where a finding would matter most. A plausible
reading is that the synthetic corpus's failures are single, clean, generated defects while a real broken
page fails in several ways at once and carries the surrounding structure too — but that is inference from
seven pages, not a result.

Two things this does NOT yet do, and neither should be glossed:

- **The threshold is still derived, not conformal.** Calibration data now exists; fitting a threshold to a
  stated error rate is the next step, and it needs the error rate to defend — a product and legal
  judgement, not a technical one.
- **19 training pages will not lift real recall on their own.** They are enough to teach the encoder what
  real page structure looks like relative to nothing; they are not a realism tier.

Split by SOURCE FAMILY rather than at random, deliberately: `images/decorative` and `images/informative`
share a template, navigation and footer, so a random split would calibrate a threshold against structure
the model had already been trained on. Asserted in the tests.

## Alternatives rejected

- **Add real pages to the OOD reference without training on them.** Fastest way to stop abstaining and
  completely wrong: the reference describes what the model was *validated* on. Padding it would claim
  competence never demonstrated, and would restore exactly the confident false positives on conformant
  pages that abstention exists to prevent.
- **Lower the abstention floor until recall looks better.** Fitting a threshold to a number we want.
  The floor is derived from the training distribution for that reason.
- **Label real pages ourselves.** Then the corpus measures our agreement with ourselves.
