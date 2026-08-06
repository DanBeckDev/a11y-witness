# ADR 0009 — Split the corpus into tiers instead of making every page realistic

**Status:** accepted, 2026-08-06
**Supersedes:** the uniform page rescale adopted in `6d5fcae`

## Context

`6d5fcae` gave every one of the 1,061 dataset pairs realistic page furniture, because the trained
scorer generalised badly: it scored <= 0.002 on real pages, and the leading explanation was that its
training pages were tiny and structurally unlike anything a real user meets. Filler was added
round-robin from five buckets, up to `{links: 40, sections: 28}`.

Measured on the guest afterwards, one capture at a time, quiet host:

| page | capture time |
|---|---|
| 40 links, 29 headings | **123.4 s** |
| 14 links | **58.1 s** |
| before the rescale | **12.4 s** |

Two consequences, and the second is worse than the first.

**It is unaffordable.** 1,696 captures at these rates is ~18 h on three workers and ~42 h on one.
The host-memory cap means three guests on this Mac is the exact over-commitment that starves workers,
so the realistic figure is the bad one.

**At the top bucket it does not even work.** 123.4 s *is* `DEFAULT_BUDGET_MS` (120 s). The capture
runs out of budget mid-sweep, so the `list` sweep reports `stop: "deadline"` and returns `lists: 0` on
a page with 40 list items — "the page has no lists" and "we ran out of time" collapsing into one
observation, which is the failure mode this project exists to avoid. Cost is linear in element count
(two round trips per sweep step at ~225 ms) and the filler multiplied element count by 20-40x.

So the top two buckets buy nothing: they are simultaneously the most expensive and the only ones
producing truncated evidence.

## Decision

**Stop treating one corpus as one test.** The corpus was doing three jobs, and the rescale applied the
requirements of the second to all of the first:

| tier | purpose | needs | does NOT need |
|---|---|---|---|
| **bulk** — 1,061 pairs | train the scorer | volume, clean good/bad contrast, label balance | real page size |
| **realism** — stratified 60-100 pairs | show the scorer generalises to real-page structure | real structure | volume |
| **canaries** — 6 pages | is a field repeatable at all | repeatability | either |

1. **Bulk returns to small.** `SCALE_BUCKETS` keeps `{0,0}` and `{6,4}` only.

   The arithmetic matters here, because a first draft of this ADR kept `{14,9}` on the assumption it
   was cheap — and the 58.1 s measurement above **is** the 14-link bucket. Fitting a line to the three
   measured points gives roughly **12.4 s + 1.2 s per element** (each element costs a prev and a next
   step, two round trips each at ~225 ms):

   | buckets kept | mean capture | 1,696 captures, one worker |
   |---|---|---|
   | `{0}` only | 12.4 s | 5.8 h |
   | `{0, 6}` | ~21 s | **~10 h** |
   | `{0, 6, 14}` | ~34 s | ~16 h |
   | all five (today) | ~70 s | ~33 h |

   Note what this exposes: the original "~5.8 h" recapture estimate in `PLAN.md` was computed for
   pages with **no filler at all**, so it was never a valid estimate for a rescaled corpus. Any filler
   costs a multiple.

   `{0, 6}` at ~10 h is one night on two workers. That is the affordability line.
2. **A realism tier is added** as a stratified sample, allocated to preserve the criterion
   distribution rather than picked by convenience, and captured at full scale. ~100 pairs is ~7 h,
   paid once, and it is what the generalisation claim is quoted from.
3. **`evidence:check`'s existing stratified sample is the per-change gate.** A capture-pipeline change
   is validated in minutes against a sample; a full recapture is reserved for a deliberate
   `CAPTURE_PROTOCOL_VERSION` bump.
4. **Results are reported per tier and never blended.** "0.9 on bulk, 0.4 on realism" is the finding;
   one averaged number describes neither and hides exactly the gap the realism tier exists to measure.

The bucket ceiling is additionally bounded by a rule rather than a taste: **no bucket may be large
enough for a capture to approach `DEFAULT_BUDGET_MS`**, because past that point the pipeline reports
absence it cannot distinguish from truncation.

## Consequences

- The recapture becomes affordable, which matters beyond convenience: a 42 h feedback loop does not
  get run, so in practice it would mean shipping unvalidated evidence.
- **The generalisation question is narrowed, not answered.** We know tiny pages gave <= 0.002 on real
  pages. We do **not** know whether 14 links is sufficient or 40 is genuinely required — the rescale
  was adopted without measuring where the benefit saturates. The realism tier is what answers this,
  and it is cheap because it is a sample. Until it has run, no claim about real-page performance
  should be made from bulk scores.
- Anything quoting a single corpus-wide number must be updated to name its tier.
- The per-sweep budget fix stays necessary. Fair allocation across sweeps is what stops one sweep
  starving the next; smaller pages make it affordable but do not make it correct.

## Alternatives rejected

- **Accept ~18 h across three workers.** Rejected on the memory cap: three guests on a 36 GB Mac is
  the documented over-commitment that produced starved workers and `/health` blackouts.
- **Halve the round trips per sweep step** (2 -> 1). **Promoted out of this list to load-bearing.** At
  ~1.2 s per element it is the term that dominates every figure above, so it is the difference between
  a corpus that can carry realistic pages and one that cannot. It is not a rejected alternative, it is
  the next piece of work — done on its own, behind `evidence:check`, because it touches the most
  defect-prone file in the repo. What this ADR rejects is *waiting* for it before making the corpus
  affordable.
- **Raise `DEFAULT_BUDGET_MS` above 120 s.** Treats the symptom: it buys complete sweeps by making
  every capture slower still, and 42 h was already the objection.
