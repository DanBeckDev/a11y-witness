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

## 1. ~~Three long jobs still report no progress~~ — MOSTLY NOT A GAP, and the real one is fixed

**Corrected 2026-08-27 by measuring it.** The entry said `export`, `build-realism` and
`calibrate-abstention` should get `beginRun()` because `lab:status` had nothing to read for them. Timed
against real runs:

| job | actual duration |
|---|---|
| `build-realism` | **2 s** |
| `export` | **13 s** |
| `acceptance` | **25 s** |

A progress file for a two-second job is pure cost. The premise — "long jobs" — was wrong, and it came
from a plan written before any of them had been timed.

**The real defect was `lab:status` itself, and it was bigger than these three.** It read `DATASET_ROOT`,
which defaults to the training corpus, so a job that does not capture at all printed the DATASET run's
`captured: 29, total: 1431` under its own name — for **31 of 36 jobs**. Two earlier fixes each covered
the case somebody had just hit. Fixed at the root: the five jobs that capture declare `progress:` beside
their command, and everything else says *"this job does not report progress"* and points at `lab:log`.

**What is genuinely left**, and it is small: `train` runs about seven minutes and prints to stdout only,
so `lab:status` can say it is running but not how far. `lab:log` shows its output. Worth a progress file
only if a longer training run ever makes the difference between watching and waiting.

## 2. ~~The real-page corpus rots, and nothing watches it~~ — DONE

`npm run corpus:urls` follows every corpus URL and reports what moved. Written 2026-08-27; it found five
more the same day, on top of the seven found by a capture refusing them:

| was | now |
|---|---|
| `financial-ombudsman.org.uk/decisions-case-studies/…` | `/businesses/resolving-complaint/…` |
| `www.sepa.org.uk/environment/water/bathing-waters/` | `bathingwaters.sepa.org.uk/` — new HOST |
| `www.bl.uk/whats-on/` | `events.bl.uk/` — new HOST |
| `www.metoffice.gov.uk/weather/forecast/…` | `weather.metoffice.gov.uk/forecast/…` — new HOST |
| `sheffield.ac.uk/postgraduate/taught/courses` | `/courses/2026` — **rots every year** |

It **reports and never edits**. A redirect means one of three things and only a human can tell them
apart: the same page at a new address, the page gone with the site offering its parent, or a consent
interstitial. Auto-rewriting would make the third a silent corpus change.

Three things it does deliberately, each of which was a decision:

- **A script, not a test.** 92 third-party requests would be slow and flaky in CI, and a test that fails
  for the wrong reason gets deleted.
- **It reuses `addressesSamePage`**, so it cannot report a move the capture would tolerate, or miss one
  the capture would refuse.
- **UNREACHABLE does not fail it.** A third-party outage says nothing about the corpus, and a check that
  goes red for somebody else's downtime is one people learn to ignore.

**Sheffield is the interesting one and is left as a known annual break.** The unversioned path redirects
to the current intake, so an unversioned URL fails EVERY capture while a versioned one fails once a year
and this audit names it. Recorded in the entry.

## 3. Most `.mjs` is still unchecked — 26 of 101 files, and the cost of the rest is now measured

| | |
|---|---|
| **why it matters** | that 73% is the CAPTURE PATH. `captureFault(code, message)` was called as `(message, code)` at two sites for as long as those faults existed — TypeScript rejects that call, and could not help |
| **today** | **26** files carry `// @ts-check` and are checked by a second `tsc` pass wired into `npm run typecheck`. `typecheck-coverage.test.ts` holds a floor that may only rise |
| **to check ALL 101 strictly** | **1,923** errors, mostly implicit `any` |
| **to check ALL 101 with `noImplicitAny` off** | **273** — and every category in it is real |

**The 273 is the number to plan against**, because its categories are the ones that catch defects rather
than style:

| errors | code | what it is |
|---|---|---|
| 78 | TS2339 | a property read off a value that may not have it |
| 78 | TS18046 | a caught value used without narrowing |
| 55 | TS2345 | **an argument of the wrong type** — the class that caught the `captureFault` swap |
| 20 | TS2322 | a value assigned to something it does not fit |

The TS18046 group is correctness, not ceremony. *Clean Code with TypeScript* puts it plainly: JavaScript
can throw **any** value, so a caught value is `unknown` and reading `.message` off it is a guess — and
when the guess is wrong the result is `undefined`, which in a diagnostic is worse than nothing because it
looks like an answer. This repo has paid for exactly that shape repeatedly.

**`errorText`/`errorCode` now exist** (`@a11y-witness/nvda-worker/error-text`) so narrowing is one import
rather than a hand-rolled ternary per site. It was a private one-liner in `capture-core.mjs` with 35 call
sites that nothing else could reach, which is why every other module narrowed by hand or not at all.

Two approaches were tried and do NOT work, recorded so nobody repeats them: a file allowlist cannot
isolate, because TypeScript follows imports and `checkJs` is program-wide; and `allowJs` in the ROOT
config drags every `.mjs` into the main program, where `@ts-check` then fails under strict (0 → 290).

**Done when** the floor reaches 101, or the remainder is declared with reasons.

## 4. ~~18 CLIs still ignore an unrecognised flag~~ — DONE

**All 45 argv-reading `.mjs` modules now refuse a flag they do not know**, name the near miss, and print
what the command does take. The exemption list is empty, and `cli-flags.test.ts` DISCOVERS every
argv-reading module and requires each to be guarded or exempted with a reason — so a new one cannot join
silently.

An ignored flag runs the default and reports success, which this repo paid for twice: a blocker naming
`--write-baseline` when the flag is `--update-baseline`, and `--only=route-title-stale` covering 1 of that
family's 7 cases.

**The lists were READ out of each file, never derived, and every batch proved why:** `stability-gate`
builds flags from a variable and `repeat-capture` reads seven through an `arg(name)` helper, so a regex
reports ZERO for both; `fleet-playbook`, `capture-fixtures` and `audit-size-sensitivity` mention flags
they pass ONWARD to git or to Python; `compare-layers` takes its input positionally; `compare-workers`
accepts `--runs=` as a deliberate alias of `--rounds=`. A derived guard would have refused correct usage
in every one of those cases.

### Two things this uncovered

**`verify-safetensors.mjs` was invoked by nothing.** Not an npm script, not a playbook, not another
module. It checks the shipped model directory for weight formats that execute on load — `.pt`, `.pkl`,
`.ckpt` — and for symbolic links that leave the directory. A security check on the one artefact this
project publishes, which had never run. It is `npm run scorer:verify` now and the FIRST stage of
`release:gate`, so an unsafe artefact stops a release before anything expensive measures it.

**It also ran on import**, so `node -e "import(...)"` — the only way to catch a bad `.mjs` import, since
neither lint nor tsc can see one — executed the whole check. `entry-points.test.ts` explains exactly why
that matters and did not cover this file, because its discovery reads npm scripts and nothing invoked
this one. Guarded, and split into named functions on the way past.

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

## 6. Two capture-path behaviours — one MEASURED AS NOT HAPPENING, one fixed and awaiting proof

### Cookie/consent overlays — detected, and never once blocking

The entry said a page whose content sits behind a modal would be captured as the modal. **Measured across
85 conformant real pages: it has never happened.** Every UK public-sector site opens with a cookie banner
and the read-through walks straight past it — networkrail opens on Cookiebot and still reaches 69
announcements and 11 headings.

The first version of that measurement said **50 of 86**, because it merged "has a banner" with "never got
past one". The accessibility tree is the discriminator: a capture that reached the page has HEADINGS in
its census. Corrected, the count is **0**.

So the honest state is: **detected, reported, and not occurring.** `rules:real-pages` names any capture
that opened on an overlay and never reached a heading — and now does so on a PASS as well as a failure,
because a bad capture that matches an equally bad baseline entry reads as stability rather than as the
defect it is.

**Nothing dismisses a banner, and that stays deliberate.** Clicking "accept all" on somebody's site is a
consent decision this tool has no business making on their behalf, and the read-through does not need it.
If a page ever IS blocked, the detector says so by name and the decision can be made about that page.

### Render readiness — fixed, awaiting proof

`waitForPageToSettle` waits for the accessibility tree to stop changing rather than for a duration.
Deliberately not "wait for content": that would hang the full budget on a page which genuinely has none,
which is exactly what `1.3.1:no-headings` exists to catch.

It costs nothing where nothing was wrong — a server-rendered page is already settled and it returns after
one 400 ms poll — and a page that never settles is captured as it stands and marked, because refusing it
would reject evidence rather than describe it.

**It did not fix the Met Office page**, which is what proved settling is necessary and not sufficient, and
what §5's DOM count is for.

**Outstanding:** a fleet deploy and `npm run evidence:check`, bundled with §5. Exit 0 means both changes
are evidence-neutral and the 2,122 cached captures survive; exit 1 means a recapture. Neither change
alters an existing field — §5 ADDS a diagnostic, and settling changes only pages that were being read too
early, which were wrong — so 48/48 SAME is the expectation. That is a prediction, and the point of running
it is that predictions about evidence are not evidence.

# Phase C — corpus: authored against a settled capture path

## 7. `2.4.4`'s rule has never fired on a real page — DONE, and the gap was the COUNT

**This entry was wrong in both halves, and an audit rather than an argument is what showed it.** It said
the rule had never been validated on real evidence and prescribed "a real page that exhibits it, not a
change to the rule". Neither was needed:

- The corpus already held such a page. `nvda-w3c-bad-before.json` is a real capture of
  `w3.org/WAI/demos/bad/before/home.html`, carrying two links both announced `"Click here, link"` in one
  paragraph — WCAG F63, and the exact shape the rule's message describes.
- The rule already fired on it. Verified offline in milliseconds, before anything was changed.

What was missing was the population. `rules:coverage` defined "real" as one directory,
`runs/real-page-corpus`, so the eval fixtures — captures of live websites, held out for judge quality —
could not be seen. **It reported an untested assumption that had been tested all along**, which is worse
than reporting nothing: it sent the next reader to find a page that was already there.

Fixed by counting every population that holds real evidence, keyed on the CAPTURE'S OWN URL rather than
on the directory — `fixtures/tutorials` and `fixtures/books` sit beside the real ones and are authored
pages and `file:///` captures, so a directory rule would have counted them and a scheme rule would have
admitted the two served from the lab's page server. Mutation-checked: removing the source reproduces the
old report exactly.

```
  2.4.4  assessed  38  0  never on a REAL page — assumptions untested      <- before
  2.4.4  assessed  38  1  validated on real evidence                       <- after
```

`1.1.1` 19 -> 29, `3.3.2` and `4.1.2` 3 -> 6 on the same change, and the unvalidated list 7 -> 6. No
criterion regressed. Pinned by `rule-coverage-populations.test.ts`, which asserts both the claim and the
discriminator, because those rot independently.

**The general lesson, which is this repo's most-repeated defect one layer further out.** "The rule never
fired" and "the rule never had its evidence" were already recorded as different answers. This is a third:
**the rule fired where nobody counted.** Before trusting any coverage number, ask what population it was
computed over — and make the number say so.

One thing checked and deliberately NOT done: `"Read more..."` on `before/template.html` looked like a
second real-page candidate and is not one. It sits in a table cell with its own intro text, so it has
programmatically determined context and is 2.4.9's question (AAA, unreported here) rather than 2.4.4's.
Adding it to `VAGUE_LINK_NAMES` would repeat 2026-08-24's most expensive mistake, where a feature
answering a different criterion's question cost 27 false positives.

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
