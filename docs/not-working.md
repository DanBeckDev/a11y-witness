# What is not working

Everything on this list is a thing the tool does wrong, cannot do, or cannot show. Nothing here is a task
that is merely unfinished — `reliability-plan.md` held those and is deleted; its items are all at their
done-conditions and the history is in git.

**Read this before quoting any number about this project.** Each entry states what was measured, on what,
and when. Where a claim rests on my local `runs/` rather than the lab's corpus, it says so — that
distinction has been wrong twice in one afternoon and is the first thing to check.

---

## 1. The shipped weights are not the weights anything says shipped

`packages/scorer/models/screenreader-scorer` holds a model trained on **2,485 records**. Nothing states
its provenance. The two pending promotion changesets both describe **2,403**, and are byte-identical to
each other — one release note, written twice, for a model that never shipped.

ADR 0007 makes the weights the scorer's API and the changeset the only record of which model produced a
given finding, which is the question somebody asks when they dispute a WCAG assertion. So the first
release would publish weights nobody can trace a finding back to.

`npm run release:provenance` now refuses this, names the provenance it wanted stated, and is the second
stage of `release:gate`. **The gate is the fix; the DATA is still wrong.** Closing it is a decision only
the maintainer can take, because it is a major release:

- the lab has a gated candidate at **2,487 records** — `releaseEligible`, held-out acceptance passed,
  and `promote:model --dry-run` confirms it clears the regression check against the shipped 2,485
- its exact bytes are in `runs/fetched/candidate.promoted-*`, and the candidate itself is intact on the
  lab at `runs/model-candidate`
- promoting it writes the changeset that closes this entry

Until then the gate is correctly red, which is the honest state rather than a defect in the gate.

## 2. Sixty free vetoes across eighteen heads

Measured on the lab, latest chain run. **One feature on three heads has been fixed; 60 pairs remain.**

| head | positives | vetoes | worst |
|---|---|---|---|
| `2.1.1:control-unreachable-by-keyboard` | 8 | 9 | `vague_link_without_context` |
| `2.1.2:focus-trapped` | 8 | 9 | `vague_link_without_context` |
| `2.4.3:focus-order-scrambled` | 8 | 9 | `vague_link_without_context` |
| `4.1.2:state-change-silent` | 87 | 7 | `form_change_nonempty` |

A veto is a feature 0 on every training positive of a subtype, which a linear head may penalise for free —
and no accuracy number can see it, because the held-out split has the same structure (ADR 0015).

`vague_link_without_context` has **no remedy of the kind that fixed `form_field_unnamed`**: that one was
solved with `tabindex="-1"`, an unnamed field the tab order never sees. A link IS a tab stop by nature, so
there is no inert form of it — making one unreachable is a different defect that collides with 2.1.1's own
signal. Closing it needs a corpus page that fails twice in a way no current pairing produces.

## 3. The focus probe cannot see a cycling modal trap

`stalled` requires the SAME control to repeat, so a trap that lets focus cycle among a modal's own controls
reads as `cycled` — **identical to a conformant page whose Tab order wraps**. A genuine 2.1.2 failure and a
correct page produce the same evidence.

Two routes, both costed and neither taken. Pressing Escape is the direct answer and collides with Escape
being NVDA's own way out of focus mode, so the evidence would not say which moved. Comparing the cycle's
size against `domCensus.formField` needs no new keystroke but misses a trap in a modal holding most of the
page's controls.

## 4. Five signal types have never been shown to discriminate

10 of 15 are covered — 4 synthetic, 6 cut from real captures. The five that are not are ALL focus-probe
types: `focus-trapped`, `focus-order-scrambled`, `control-unreachable-by-keyboard`, `route-title-stale`,
`skip-link-inert`.

Each reads `interaction.focusOrder` or the probe's diagnostic mark, and no capture in the corpus copy on
disk carries one for a case using them. A dead predicate here would blind every case using it, silently.
The way in is the same extraction that produced the other six, once a corpus with focus evidence exists.

## 5. Thirty-four `.mjs` files are still unchecked

**73 of 107 now, from a real 32.** The figure this entry used to carry — 53 — counted files bearing a
`// @ts-check` marker, and **21 of those were outside the `tsc` program entirely**, so the marker was a
comment. Proved by planting `const X: number = "s"` in a marked file and watching nothing happen. Two
assertions now make an inert marker impossible, so the number above is coverage rather than intent.

`capture-core.mjs` — 3,112 lines, the largest single block and the capture path itself — is done, and it
was hiding the defect that justifies the whole exercise: `waitForPageToSettle` treated a FAILED census as
a reading, so two consecutive CDP failures compared equal and the page was declared settled. That wait is
the only defence against capturing a client-rendered shell.

**Every batch has found real defects rather than missing annotations.** A state shape spelled twice and
drifted; a map type that could not express the invariant its store exists to protect; three options types
inferred from their own defaults, so the options without defaults vanished; two required parameters with
`= {}` defaults that made their own guards silently never fire; a `kill(undefined)` on a `process.exit`
handler. That is the argument for continuing, not the count.

What is left is 34 files. `case-matrix.mjs` (3,311 lines) and `server.mjs` (1,126) are the large ones.

## 6. Nobody knows how the scorer behaves on a user's pages

Calibrated against 94 real pages from five publishers. A page shape absent from that set could be
mis-scored systematically and nobody would learn.

**Decided against collecting**, not merely unbuilt — see `SECURITY.md`. This tool is aimed at pages behind
an organisation's authentication and the transcript IS the page's text; a report useful enough to act on
carries that. What bounds the risk is design: a model finding is unmapped, so it becomes `cantTell` — a
referral, never an assertion. The layer that ASSERTS is deterministic and measured at 0 false positives
over 1,183 conformant records.

This is the item that pins the Monitoring section of the ML Test Score, and under the minimum rule that is
the score.

## 7. Two gates are proven only at their decision

`promote:gated` — `releasability()` is mutation-proven (suppressing its blockers fails 13 tests). The
WIRING half is not: copying weights into `packages/scorer/models/` and refusing a dirty tree.

`eval:gate` — `evaluateFitness` is proven; running the 34 fixtures through the scorer is not, because it
needs the Python venv and cannot run in CI.

Both are recorded as partial in `gates-are-proven.test.ts` rather than counted as whole.

## 8. Nothing has ever been published

Five changesets pending, `access: "restricted"`, and `release.yml` has never run for real. Every guard
around publishing is therefore **untested against an actual publish** — including guard 5, the
consumer-path query added today, which has been mutation-checked but never seen a real dispatch.

The first release will exercise all five for the first time simultaneously, which is the one thing this
repo's own rules say not to do. Worth a dry run before the real one, which the workflow supports.

---

## Closed since this list was written

**`2.4.4` reading validated here and never-fired on the lab** — it was never a contradiction. The lab's
run was 26 Aug 23:19 and the fix that taught the audit to count eval fixtures landed 27 Aug 10:04,
eleven hours later. Re-run at HEAD, the lab reports `2.4.4 assessed 68 1 validated on real evidence`
and agrees with local.

Establishing that meant comparing a journal timestamp against `git log` by hand, because the journal
carried no code identity at all — so the fix is not the number, it is that the question is now answerable.
`run-job.yml` stamps `<job> at <sha12>[ DIRTY]` into the unit description, systemd opens every journal
with it, and `lab:status` prints `What code produced this run` outright. A journal predating the stamp
says `NOT STATED` rather than going quiet.

Two more found by pulling that thread, both fixed: `promote:model` named its changeset from a COUNT of
`.changeset/`, so one promotion overwrote another's release note — that is what the duplicate above is —
and `lab:fetch` looked for a literal `promote-candidate-4.md` while the lab held `-6`, so the one
artefact that entry exists to rescue was unfetchable.

## How to read the numbers on this page

- **Lab, not local.** Item 2 quotes the lab. My local `runs/` is a partial copy and its audits
  describe the copy: it reported six criteria as "NEVER FIRED ANYWHERE" while the lab reported every one
  of them validated. That is not a bug in either — it is what a stale corpus does — and building this list
  on the local numbers was avoided by an hour, not by design.
- **A count is where an investigation stops.** Where an entry gives one, it also gives what to look at.
- **Nothing here is closed by declaring it.** That was the previous list's job and it is done.
