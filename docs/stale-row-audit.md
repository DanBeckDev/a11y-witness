# Why a tracker row goes stale — swept 2026-09-06, with the command that settled each one

Nine rows were found already-done or wrongly-premised in one day, every one by a worker about to start
building against it. That is a class, not nine accidents, and this is the sweep that establishes what the
class actually is.

**Every verdict below was produced by RUNNING something.** Where a row carries its own `## Open-check`,
that is what was run — the row's own falsifier, executed a second time. No verdict here comes from reading
a row and forming an opinion about it.

## What the sweep found

| row | its own check, re-run | verdict |
|---|---|---|
| **#42** *Nothing has been installed from a published tarball* | `npm run gate:isolation` → **6/6 packages usable installed**, every subpath resolving, no undeclared dependency | **The work is DONE and passing.** Its acceptance is `release:gate:ci`, which stops at stage 3 on an unrelated blocker — see below. Labelled `ready`. |
| **#4** *action-smoke red for 85 consecutive runs* | `gh run list --workflow=action-smoke.yml --limit 100` → **99 consecutive failures, 0 successes in 100 runs** | **LIVE, and understated.** The number moved the wrong way. The cause is not the action: the log reads `Captured 89 announcements` and then fails in the scorer — see below. |
| **#30** *A GET form submit changes the URL, so the census refuses 18 records* | `grep submitOnlyAddedAQueryString packages/evidence/src/verify.ts` → defined at 985, consulted at 1005; `verify.test.ts` carries tests named `#30:` | **Code half DONE and tested.** Only the fleet measurement remains (`lab:job -e job=rules-real-pages` must show the 18 move). Labelled `ready`, which reads as buildable. |
| **#51** *A 15 s wall-clock assertion cannot tell a hang from a loaded host* | `grep CONTROL_DEGRADED_MS\|controlSpawnMs\|timedOut packages/lab/src/packaging/no-worker-refusal.test.ts` → all three present | **DONE.** The test now measures a control spawn and separates host degradation from a hang. |
| **#13** *The trainer rotates its one retained generation at STARTUP* | `grep rmtree/move packages/lab/scripts/train-screenreader-model.py` → still at lines 236-239 | **Premise TRUE, concern ANSWERED.** `train-rotation-safety.test.ts` pins the property that actually protects the generation (the report is written atomically and last, so a dying train never reaches the rotation branch). Restate; do not close. |
| **#11** *`diagnose-false-positives.py` exits 0 on an empty corpus* | `grep 'return 0' packages/lab/scripts/diagnose-false-positives.py` → line 118, unconditional | **LIVE and accurate.** A deliberate non-fix, documented as such in `exit-code-contract.test.ts`'s `DOCUMENTED_PY`. The control case for this sweep: a row can stay open and stay right. |
| **#52** *The `runs/` rule is in CLAUDE.md as a temporary home* | `grep 'A GATE THAT READS' CLAUDE.md` → present at 546, with a note recording it was moved there when `docs/backlog-ready.md` was retired | **Ambiguous, needs restating.** The rule has a home and the move is recorded. Whether CLAUDE.md IS the permanent home is a decision the row asks for and nobody has made. |
| **#33** *The corpus is 85 pages from two publishers* | `REAL_PAGES` measured directly → **98 entries, 0 without a source, 50 distinct claim sources, 68 hosts** | **Premise REFUTED on its numbers; concern survives in a sharper form.** All 8 pages published as INACCESSIBLE are `w3.org` or ours, which `real-page-corpus.test.ts:181` already pins. The row sends someone to add publishers; what is missing is one page somebody else publishes as inaccessible. |

## THE FINDING: three publish-blockers, one root cause, and no row says so

`action-smoke` (#4) fails with:

```
the local scorer exited 1: screen-reader scorer failed: scorer representation schema does not match the runtime
```

`release:gate:ci` (#42's acceptance) stops at stage 3 with:

```
BLOCKED  a schema migration is open: screenreader-structured-v18 -> screenreader-structured-v19
```

These are the same fact, measured two ways:

```
runtime featurizer   FEATURE_SCHEMA_VERSION = "screenreader-structured-v19"   (screenreader_features.py:112)
shipped weights      screenreader-structured-v18                              (schema-migration.json, and
                                                                              gate:isolation prints it)
```

`score.py`'s `verify_artifact` refuses, correctly. So **#4 and #42 are both unactionable until the v18→v19
migration closes, which is #35 — fleet-gated on the retrain after the in-flight recapture.** Neither row
names that dependency, and both read as independently pickable publish-blockers.

**The action itself is fine.** `Captured 89 announcements` is in the failing log, after axe-core ran and
the worker answered. A reader who takes "red for 85 consecutive runs" at face value goes looking for a
broken action; the action works end to end and one artefact stamp is wrong.

## What actually makes a row go stale

The hypothesis this sweep was given was that **a row records a mechanism as well as a symptom, and the
mechanism is the half that rots** — `not-working.md` §26's shape, in the tracker rather than in the code.
**The evidence does not support that as the main driver**, and the distinction matters because the two
have different remedies.

§26's shape appeared exactly once here: **#12**, whose open-check grepped `endsWith` in
`exit-code-contract.test.ts`, matched the `.mjs`/`.ts` line, stopped, found a sibling comment agreeing with
it, and concluded a gap was open that had been closed hours earlier. That is a mechanism rotting, and it is
the most expensive single instance because it misled an *instrument* rather than a reader.

Every other row went stale by a different route, and they share one property:

> **A row's premise is verified ONCE, at filing time. Everything that could re-verify it — the
> `Open-check`, the `Acceptance` command, the `ready` label — is written to be READ rather than RUN, and
> nothing re-runs it. The row does not rot; the world moves and the row is never asked again.**

Read that way, the nine sort cleanly into four shapes, and only the first is §26:

1. **The mechanism rotted** (#12). A cited fact stopped being true and two copies corroborated each other.
   *Remedy: pin the citation with a test — done, in `gate-partial-corpus-contract.test.ts`.*
2. **The work landed and nothing re-read the row** (#10, #27, #45, #51, #60). The premise was true, the fix
   merged, the row stayed. *Remedy: re-run the open-check at merge, not at filing.*
3. **The acceptance command cannot pass, for a reason outside the row** (#4, #42, and #10 in a second way —
   its acceptance path `packages/scorer/python/` collects zero tests and exits 5). A row whose falsifier is
   broken can never be closed by evidence, so it stays open on the strength of nobody checking.
   *Remedy: run the acceptance command WHEN THE ROW IS FILED. All three failures here are visible in one
   run and none needs the fleet.*
4. **The label outlived the state** (#30, #33). Work reduced the row to a fleet-gated measurement while the
   `ready` label still advertised it as buildable — which is precisely what makes a worker pull it.
   *Remedy: `ready` is a claim that a fleet-free path to acceptance exists; it should be dropped the
   moment that stops being true.*

**The cheapest single change is shape 3, and it is one command.** A row is filed with an acceptance
command nobody has ever executed; executing it once at filing time would have caught #4, #42 and #10 —
three of the nine — before either cost a dispatch. The second cheapest is shape 2: the row's own
`Open-check` is the merge-time question, and it is already written down.

**And shape 4 says something about the `ready` label that the board should decide rather than infer.**
`ready` currently means "somebody thought this was pickable when they filed it". Every row in shape 4 was
`ready` and none was pickable. If `ready` instead meant "the acceptance command has been run and names a
fleet-free failure", it would be a claim about the present rather than a memory of the past — and it is
checkable, because running an acceptance command is what produces it.

## What this sweep did NOT establish

- **Rows behind a fleet gate were not swept**, except where their premise names a file this checkout
  holds. `runs/` here is a copy, and CLAUDE.md's own rule is that a gate reading it gives a verdict only
  to the agent driving the lab. A premise about the corpus is not answerable from here and saying
  otherwise would be the defect this document is about.
- **`decision` rows were not swept.** They are waiting on a person, not on a fact, and re-running anything
  would not move them.
- **This is 8 rows of 53.** The claim is about the SHAPES, which repeat, not about the remaining 45 being
  sound.
