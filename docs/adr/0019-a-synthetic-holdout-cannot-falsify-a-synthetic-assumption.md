# 0019 — A synthetic hold-out cannot falsify a synthetic assumption; real pages are the only unshared measurement

**Status:** accepted 2026-08-24

## Context

On 2026-08-24 a scorer candidate reached **0 misses and 0 false accusations** on the enlarged held-out
acceptance set — 14 of whose pairs had never been measured before, deliberately sharing no failure-bearing
string with batch 1. Every gate agreed: `release:gate`, `rules:gate`, `scorer:shortcuts`, `npm run eval`.

Scored against the 22 held-out **real** pages — 19 publisher-declared conformant, 3 publisher-declared
inaccessible, five publishers, none written by this project — the same candidate produced:

| | shipped model | candidate |
|---|---|---|
| false accusations on conformant real pages | **0** | **12 of 18** |
| publisher-declared inaccessible caught | 2 of 3 | 3 of 3 |

One additional true catch, bought with twelve findings a publisher's own conformance statement contradicts.

The cause was a real bug, and its shape is the point. `role_name` had been fixed days earlier to find its
role anywhere in a phrase rather than only at the start — correct, it had been reading a minority of link
announcements. But it still captured `(.*)$`, so an accessible name ran to the **end of the line** instead of
stopping where the next object begins. NVDA packs several objects into one announcement:

    "link, Accessibility statement, link, Sitemap, link, Cookies"    -> ONE name, three links
    "link, graphic, GOV dot UK"                                      -> a stacked prefix, not a boundary

**Corpus pages announce one object per line.** There, the tail *is* the name, so the defect is not merely
hard to see — it is structurally inexpressible. It appears only where announcements are dense, which is every
real page with a navigation bar and no corpus page at all. Eleven of the twelve false accusations were 2.4.4
on GOV.UK Design System component pages, which share furniture: one mistake, replicated across a site.

## Decision

**Treat the real-page sweep as a regression gate, not as calibration**, and state plainly which measurements
can and cannot falsify which assumptions.

1. `calibrate-abstention.mjs` reads the shipped model's sweep as a baseline, reports the delta in false
   accusations at the floor the model actually uses, and **exits non-zero when that count increases**.
2. Every other gate here — acceptance, `rules:gate`, `scorer:shortcuts`, `eval` — runs on pages this project
   generated. They are blind to generator-shaped faults **by construction**, and that is now written where a
   reader will meet it rather than inferred after an incident.
3. A hold-out **widened within the same generator** does not address this. The 14 new pairs were genuinely
   unseen and genuinely useful for other faults; they could not have caught this one, because they announce
   one object per line like every other page the generator makes.

## Consequences

- A candidate that improves recall while accusing more conformant real pages now **fails** rather than being
  reported as an improvement. That trade may still be the right one — it is no longer available silently.
- The gate needs the lab: 22 real captures and an encoder. It is release-time, never in the pre-push hook.
- **22 pages express error rates no finer than about 4.3%.** This gate detects a change of several pages, not
  of one. Widening the real-page corpus is what makes it sharper, and remains the highest-value corpus work —
  see ADR 0010, which notes only three publisher-declared *inaccessible* pages exist.
- A baseline is required to compare against, so the shipped model's sweep is now an artefact with a purpose
  rather than a file left over from calibration.

## Alternatives rejected

- **Widen the synthetic hold-out further.** Already done, and it produced the false clean this record exists
  to explain. More pages from the same generator raise confidence about faults the generator can express and
  say nothing about the rest. This is ADR 0015's rule — *a metric computed on data that shares the flaw
  cannot see the flaw* — applied to the hold-out rather than to a feature.
- **Gate on the synthetic numbers and inspect real pages by hand occasionally.** That is exactly what
  happened here: the sweep had printed the deciding column since it was written and nothing compared it. The
  regression was found because a human asked for it on a particular afternoon. A number nothing compares is a
  number nobody reads.
- **Score real pages as ordinary labelled data and train on them.** They are not labelled at the instance
  level: a conformance statement is a claim about a page, not about an announcement, and a *disclosed*
  failure is a positive label we currently discard rather than mislabel. Keeping them strictly out of
  training is what makes them able to falsify anything at all.
- **Lower the abstention floor so more real pages are scored.** The floor is derived, and it is what kept an
  out-of-support page from being scored and returned as "no findings" on a page its own publisher calls
  inaccessible. Moving it to make a number look better would remove the one guard that was working.

## What would falsify this

If a candidate regressed on real pages while the synthetic hold-out *also* caught it, the claim that these
measure different things would be weakened. Two more instances would settle it either way. The mechanism
above is specific and testable: corpus pages announce one object per announcement, real pages do not — count
objects per announcement in both and the gap is measurable rather than argued.
