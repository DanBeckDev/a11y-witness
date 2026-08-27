# Known gaps

What this project does **not** currently do, or does not yet know. Written 2026-08-27, when all seven
gates passed together for the first time and a model shipped.

**This exists because "all gates pass" and "everything is validated" are different claims.** The gates
pass. Everything below is true at the same time, and none of it is hidden in a comment somewhere — each
entry names what is missing, what it would cost, and what would tell you it is fixed.

---

## The order these should be done in

Not by size, and **not** by what is closest to finished. By what CONSUMES what.

An earlier draft of this file put the retrain first, because it is nearly free and the model is only one
revision behind. That is the wrong order and it is worth saying why: **training consumes the corpus, and
the corpus consumes the capture path.** Retrain first and you retrain again after every item below it.
The same logic puts publishing last — a changeset describes weights, so it should describe the final ones.

| phase | items | why here |
|---|---|---|
| **A — tooling** | §1 progress files, §2 url audit, §3 typecheck, §4 CLI flags | touch no evidence and block nothing. Do them whenever; they make every later phase easier to watch and harder to get wrong |
| **B — capture path** | §5 DOM-side count, §6 cookie overlays and render readiness | these change what a capture CONTAINS. Anything captured before them may have to be captured again |
| **C — corpus** | §7 a real 2.4.4 page, §8 three subtypes' fifth case, re-add the page from §5 | authored against a settled capture path, so the cases are captured once |
| **D — model** | §9 retrain and re-promote, §10 publish | consumes A–C. Last, by definition |

### Two things that decide the real cost

**Bundle phase B.** Both items may bump `CAPTURE_PROTOCOL_VERSION`, and that invalidates every cached
capture — 2,122 of them, about four hours of fleet time. Doing them together pays that once. CLAUDE.md's
own rule: *"the cheap moment to pay it is bundled with any other pending bump"*. Run `npm run
evidence:check` on each change first — exit 0 means the change is evidence-neutral and the cache survives,
and neither of these is obviously one or the other.

**Prove each corpus change on ONE subtype before paying for the whole corpus.** `npm run lab:pipeline --
--pipeline=verify --only=<ids>` captures just those cases and runs the audits that would see the change.
A full recapture to discover a fix did not move the number is the wrong order, and this exists to stop it.

**Phase A can run alongside anything.** It is the only phase with no evidence dependency, so it is also
the right thing to do while a capture is in flight.

---

---

# Phase A — tooling: touches no evidence, blocks nothing, do it anytime

## 1. Three long jobs still report no progress


`export-screenreader-dataset`, `build-realism-tier` and `calibrate-abstention` have no `beginRun()`, so
`lab:status`, `training:wait` and the corpus-settled check have nothing to read for them.

`capture-screenreader-dataset` and `capture-real-pages` have it. The Ansible plan named this work for all
of them and only the first ever got it.

**Until then, `lab:status` on those jobs falls back to the training corpus's file** — which is how
`captured: 29, total: 1431` was reported for a fifty-page job. The fallback is now keyed per corpus, so it
answers correctly for the two that DO report; the other three still have nothing to report.

## 2. The real-page corpus rots, and nothing watches it


7 of 50 calibration URLs were stale redirects — the sites had moved their pages. Found only because a
capture refused them.

Now a `wrong-page` failure says the site probably moved the page and points at the corpus entry, so it is
visible when it happens. **There is no periodic check**, so it is found at capture time rather than before.

A `corpus:urls` audit that follows each URL and reports redirects would catch it in seconds, off the
fleet.

## 3. 73% of source lines are not typechecked


| | |
|---|---|
| **measured** | 26,102 lines of `.mjs` against 9,776 of `.ts` |
| **why it matters** | that 73% is the CAPTURE PATH. `captureFault(code, message)` was called as `(message, code)` at two sites for as long as those faults existed — TypeScript rejects that call, and could not help |
| **cost** | `checkJs` across the tree is **1,974** errors; **131** with `noImplicitAny` off. Mostly type inaccuracies (`log = () => {}` infers zero-arg), not bugs |
| **today** | 16 files carry `// @ts-check` and are checked by a second `tsc` pass wired into `npm run typecheck`. `typecheck-coverage.test.ts` holds a floor that may only rise |
| **fix** | raise the floor one verified file at a time; `noImplicitAny` off for the `.mjs` pass would take a large bite at once |
| **done when** | the floor reaches the file count, or the remainder is declared with reasons |

Two approaches were tried and do NOT work, recorded so nobody repeats them: a file allowlist cannot
isolate, because TypeScript follows imports and `checkJs` is program-wide; and `allowJs` in the ROOT
config drags every `.mjs` into the main program, where `@ts-check` then fails under strict (0 → 290
errors).

## 4. 18 CLIs still ignore an unrecognised flag


Down from 38. An ignored flag runs the default and reports success — this repo has paid for it twice
(`--write-baseline` for `--update-baseline`; `--only=route-title-stale` covering 1 of 7).

`cli-flags.test.ts` holds them in `UNGUARDED`, which **may only shrink**: a discovered CLI that is
neither guarded nor listed fails the test.

**The flag lists must be READ out of each file, never derived**, and every batch so far has proved why:
`stability-gate` builds flags from a variable and `repeat-capture` reads seven through an `arg(name)`
helper (a regex reports ZERO for both); `fleet-playbook` and `capture-fixtures` mention `--ff-only` etc.
because they pass them to GIT; `compare-workers` accepts `--runs=` as a deliberate alias of `--rounds=`.

# Phase B — capture path: changes what a capture CONTAINS. Bundle these

## 5. One page is out of the corpus and nobody can say why it failed


`weather.metoffice.gov.uk/warnings-and-advice/uk-warnings` yields 27 announcements of navigation and a
census of `heading=0`, twice, byte for byte — while its published HTML carries **forty** headings.

Either this tool never renders it, or it renders and exposes almost nothing to the accessibility tree —
**which would be a severe genuine finding**. Waiting for the DOM to settle changed the output not at all,
so it is not a race.

**The measurement that would settle it does not exist.** `crossCheckStructure` compares the SWEEP to the
AX-TREE CENSUS and both are accessibility-layer, so neither can see a DOM the tree is failing to expose.

| | |
|---|---|
| **fix** | a DOM-side element count over CDP, carried as `ruleEvidence` — evidence the rules may see and the model may not |
| **also buys** | a real answer to "is this page inaccessible or did we fail to read it", which is the question this whole tool exists to answer |
| **done when** | the page can be re-added and its verdict attributed either way |

## 6. Two capture-path behaviours are unhandled


- **Cookie/consent overlays.** Handled incidentally — the read-through walks past them — but nothing
  dismisses one, so a page whose content sits behind a modal would be captured as the modal.
- **Render readiness.** `waitForPageToSettle` now waits for the accessibility tree to stop changing, which
  costs nothing on a server-rendered page. It did NOT fix the Met Office page (§5), so settling is
  necessary and not sufficient.

Both need `evidence:check` before any change ships: exit 0 means the change is evidence-neutral and the
cache survives; exit 1 means a full recapture.

---

# Phase C — corpus: authored against a settled capture path

## 7. `2.4.4`'s rule has never fired on a real page


Reported by `rules:coverage` every run: *"68x on the corpus, 0x on a real page — assumptions untested"*.
Non-blocking only because the trained scorer also covers 2.4.4.

The corpus's vague-link vocabulary is deliberately narrow (six phrases context cannot rescue). Real sites
use different ones. **Fix is a real page that exhibits it**, not a change to the rule.

`1.4.2` reads `0 corpus 0 real` and is fine: it declares that no real-page evidence is possible.

## 8. Three subtypes have fewer cases than furniture buckets


`focus-trapped`, `focus-order-scrambled` and `control-unreachable-by-keyboard` have **4 cases each**
against **5** layout buckets — so each misses one furniture shape by construction. `furniture-spread.test.ts`
asserts the property per FEATURE, so this is visible rather than silent.

A fifth case each. This is corpus authoring, and it changes what those heads are trained on.

# Phase D — model: consumes everything above

## 9. The model is one corpus revision behind


| | |
|---|---|
| **state** | shipped model trained on **2,403** records; the corpus now exports **2,426** |
| **why** | the 29 `1.3.1:no-headings` cases were added after the promotion |
| **does it invalidate anything?** | No. `1.3.1:no-headings` is `decidedBy: "rules"`, so the model is not expected to cover it, and every gate that judges the model passed against the weights that shipped |
| **fix** | `npm run lab:job -- -e job=everything` — retrain, re-gate, re-promote |
| **done when** | `training-report.json`'s `dataset.records` matches the export's record count |

Worth doing before the next corpus expansion, so the model and corpus move together rather than drifting
by one more revision each time.

## 10. Two changesets are pending publish


`.changeset/promote-candidate-4.md` and `.changeset/promote-v15-scorer.md`. Both are MAJOR on
`@a11y-witness/scorer`, because the weights ARE the API — a consumer's build can go from passing to
failing with no code change on their side.

Committed, not published. `npm run release:version` then `changeset publish`, deliberately, when you want
it out.

## What is NOT on this list, deliberately

- **`1.3.1`** — closed. `29/29 rules: EXACT`, validated on a real page. Was "the claim rests on nothing"
  for the life of the rule.
- **The `1.1.1` census rule** — closed by the same change, and it was the worse of the two: sibling rules
  fire, so its criterion read "validated on real evidence" the whole time it was unreachable. Corpus
  evidence went **350 → 734**.
- **`worker:code` crashing with no local VM** — checked, does not. That trace was UTM launching.

## The pattern behind most of these

Almost every defect found on 2026-08-26 was **a diagnostic that could not report itself** — a fetch that
failed and reported success, a guard that fired correctly and crashed writing its own message, a status
command reading another job's file, a fault losing its diagnostic to swapped arguments, a metric merging
two different facts.

The system was largely working and very hard to see working. See CLAUDE.md, *"A diagnostic that cannot
report itself"*, for the six and the three habits that would have caught them.
