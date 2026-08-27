# What is not working

Everything on this list is a thing the tool does wrong, cannot do, or cannot show. Nothing here is a task
that is merely unfinished — `reliability-plan.md` held those and is deleted; its items are all at their
done-conditions and the history is in git.

**Read this before quoting any number about this project.** Each entry states what was measured, on what,
and when. Where a claim rests on my local `runs/` rather than the lab's corpus, it says so — that
distinction has been wrong twice in one afternoon and is the first thing to check.

---

## 1. A rule reads as validated here and unvalidated on the lab

The sharpest one, because it means a fix I verified may not be real.

```
local  (31 real captures)     2.4.4  assessed  38   1   validated on real evidence
lab    (100 real captures)    2.4.4  assessed  68   0   never on a REAL page
```

Same code — pushed. Same fixture — `nvda-w3c-bad-before.json`, committed, and `ruleFindings` fires 2.4.4
on it locally with evidence `"Click here, link"`. The lab counts 100 real captures, which is 94 real pages
plus the 5 eval fixtures, so the fixture IS in its population.

**Cause unknown.** Until it is found, the §7 claim ("2.4.4 is validated on real evidence") is unproven on
the authoritative corpus, and one of the two runs is lying. Start by establishing which commit the lab's
job actually ran, then whether `withCensus` changes the record the audit passes to `ruleFindings`.

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

## 5. Half the `.mjs` is unchecked, including the capture path

**54 of 105 files, 1,796 errors.** 76% are unannotated parameters and destructured bindings, and they are
not independent: these are duck-typed modules whose callers pass partial objects, so annotating one
function propagates into every caller and its tests. On `capture-decisions.mjs`, five annotations took 8
errors to 21 across two files — every one a real disagreement about what a value is.

It matters most where it is worst: `capture-core.mjs` (219 errors) is the capture path, where
`captureFault(code, message)` was called as `(message, code)` at two sites for as long as those faults
existed. TypeScript rejects that call and could not help.

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

## How to read the numbers on this page

- **Lab, not local.** Items 1 and 2 quote the lab. My local `runs/` is a partial copy and its audits
  describe the copy: it reported six criteria as "NEVER FIRED ANYWHERE" while the lab reported every one
  of them validated. That is not a bug in either — it is what a stale corpus does — and building this list
  on the local numbers was avoided by an hour, not by design.
- **A count is where an investigation stops.** Where an entry gives one, it also gives what to look at.
- **Nothing here is closed by declaring it.** That was the previous list's job and it is done.
