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

**The cause, measured — and the first answer was wrong.**

The initial diagnosis was that `role_name` captured `(.*)$`, so an accessible name ran to the end of the
line instead of stopping at the next object's role. NVDA packs several objects into one announcement, and
`"link, Accessibility statement, link, Sitemap, link, Cookies"` was being read as ONE link name. That is a
real defect, it is fixed (schema v12), and **it was not the cause of these findings.** Retraining under v12
produced a byte-identical sweep: the same 12 pages, the same criteria, the same scores.

The actual cause, measured directly:

    VAGUE_LINKS = {"click here", "details", "go", "here", "info", "learn more", "more",
                   "read more", "that", "this"}

    the announcement that matches, on every GOV.UK component page:   "link, Details"

The GOV.UK Design System documents a component called **Details**, and every component page links to it.
`vague_link_present` is an EXACT match against a hand-written wordlist, so it is 1 on all of them, and the
head reports 2.4.4 on each. It was already 1 under the old extractor, which is why the fix moved nothing.

**In the corpus, "details" appears only ever as a deliberately vague link.** The generator never produces it
as a proper noun, so the feature is a perfect predictor there and is wrong only where the same word carries a
different sense — which is a property of real writing and of no page we author. 2.4.4 is *Link Purpose (In
Context)*, and an exact wordlist over link text has no context to consult; the criterion's own name says what
the feature is missing.

This is ADR 0015's shortcut lesson and this record's hold-out lesson meeting: a feature that cannot be wrong
on the corpus, inside a hold-out drawn from that same corpus.

**Eleven of the twelve false accusations are one mistake replicated across one publisher's component pages**,
which share furniture. Counted as pages it is 12; counted as distinct errors it is three.

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
measure different things would be weakened. Two more instances would settle it either way.

The measurement that survived the wrong first diagnosis is worth keeping, because it is the sharpest number
here even though it turned out not to explain these findings. Announcements containing a link, and how many
of those contain **two or more** links — the packing that a name running to end-of-line misreads as one:

| | announcements with a link | two or more in one |
|---|---|---|
| corpus (400 captures) | 1,254 | **0 (0.0%)** |
| real pages (77 captures) | 4,659 | **379 (8.1%)** |

Zero against 8.1% is what "structurally inexpressible in the corpus" means as a number, and it is the general
form of the claim this record makes. The specific fault it was measured for was something else.
