# Reliability plan

The working tracker. `known-gaps.md` is the RECORD of what was closed on 2026-08-27 and stays as history;
this is the list to work through.

Two published rubrics are used here rather than a list of my own opinions, because a list of opinions is
what produced nine near-identical defects in one day.

| | |
|---|---|
| **[The ML Test Score](https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/)** (Breck et al., Google) | 28 tests in four sections. Half a point for running a test manually with the result documented, a full point for a system that runs it automatically. **The final score is the MINIMUM of the four sections**, because "a system must consider all in order to raise the score" |
| **The SRE Workbook's pipeline maturity matrix** (ch13) | five characteristics — failure tolerance, scalability, monitoring and debugging, ease of implementation, unit and integration testing — scored 1 (chaotic) to 5 (continuous improvement) |

## Where this project scores today

Scored honestly, by the paper's own rule. Half points are things done and documented; full points are
things a command does on every run.

| section | score | what pins it |
|---|---|---|
| Features and Data | ~4.5 | strong: `corpus:starvation` and `scorer:shortcuts` are automated and catch the failure ADR 0015 is about. Missing: no per-feature cost accounting, no distribution/range tests on the exported dataset |
| Model Development | ~4.5 | strong: per-subtype slice quality, NP threshold calibration, a baseline to compare against. Missing: no fairness/inclusion analysis, and offline-vs-real correlation is measured once rather than tracked |
| ML Infrastructure | ~5 | strong: full pipeline integration-tested end to end, quality validated before promotion, `explain-scorer` for debuggability, training seeded (`torch.manual_seed`). Missing: **no canary before publish**, rollback is "git checkout and re-run" |
| **Monitoring** | **~3** | **the minimum, so this is the score.** Training/serving skew is tested (`test_live_capture_carries_the_parse`), staleness is tested. Missing: nothing watches numerical stability, nothing notices a dependency changing under us until it bites, and **nothing at all knows how the shipped scorer behaves on a consumer's pages** |

**ML Test Score ≈ 3 → "Reasonably tested, but it's possible that more of those tests and procedures may
be automated."** That is a fair description and it is not a failing grade — but the *minimum* rule is the
point: improving data or model work moves nothing until monitoring moves.

### The honest caveat about the Monitoring section

The rubric assumes a model **served** with live traffic. This one ships inside a CLI and a GitHub Action,
so three of its seven monitoring tests are about a thing that does not exist here. That is not a free
pass. The analogue is real and unaddressed: **nobody knows how the scorer behaves on a consumer's pages.**
The `cantTell` design mitigates the harm — an unmapped model finding is a referral, never an assertion —
but mitigation is not measurement.

## Architecture: is it right?

**Largely yes, and the evidence is specific.** Every one of the nine defects found on 2026-08-27 was in
the CHECKING layer, not in the product: a report that could not report itself, a gate that ran too late,
a default that was silently a subset. None was a wrong finding about a web page. A system whose failures
cluster in its instrumentation has the right shape and the wrong instrumentation.

Four things are worth questioning anyway, and three are gaps rather than mistakes.

### 1. Three orchestration layers — KEEP

npm scripts → a node step-runner (`lab:pipeline`, `lab:everything`) → Ansible → systemd. That looks like
too many, and it is not: the two halves live in different credential domains (ADR 0012), which was
measured rather than assumed, and the SRE Workbook explicitly recommends *"smaller pipelines that you can
release and monitor separately"* over one monolith — which `--pipeline=<name>` already is.

### 2. Idempotency is CLAIMED and never asserted — GAP

`lab:pipeline`'s own failure message says *"every stage is idempotent, and a stage that already succeeded
either hits its cache or re-runs cheaply."* Nothing tests that. The Workbook names idempotent mutations as
the first resilience pattern for exactly this reason: *"separate executions of a pipeline with the same
input data always produce the same result."* An unasserted claim about re-running is the same class as an
unproven gate.

### 3. No checkpointing inside a stage — GAP

A capture run resumes (`--resume`). A train does not, an export does not, and a real-page capture does
not. The Workbook: *"pipelines that are terminated early will lose their state, requiring the entire
pipeline to be executed again. This is especially true for pipelines that create AI models."* Today a
killed train costs the whole train.

### 4. No canary before publish — GAP

Both rubrics ask for one. `promote:gated` gates on quality, then the weights are committed and
`changeset publish` puts them on npm in one step. There is no intermediate state where a real consumer
exercises the new weights before everyone gets them. This is the single biggest structural gap.

### What NOT to change

- **Do not replace the pipeline with an off-the-shelf orchestrator** (Kubeflow, Airflow, Dagster). They
  solve fan-out across many workers with heavy dependency trees; this is one lab box, ~5 job types,
  concurrency 1, where **retries are actively wrong** — a retried real-page capture is a second live
  fetch of somebody's website. The supply-chain surface next to the corpus and the release keys is the
  cost ADR 0012 already declined to pay.
- **Do not move the corpus into a database.** It is 2,448 records that are regenerated from case
  definitions and captures. Its addressability by file is what makes `--only=` and the verify pipeline
  cheap.

---

# The backlog

Phased by what CONSUMES what, the same rule `known-gaps.md` used: tooling, then the capture path, then
the corpus, then the model. Each item states what it is, why it matters, and **what would prove it done**.

## Phase A — the checking layer (highest value per hour, all offline)

### A1. ~~Eight gates have never been watched fail~~ — DONE, 16 of 16

**Every gate that can stop this pipeline has now been watched refusing.** It was 0 this morning.

The recipe in [`proving-a-gate.md`](./proving-a-gate.md) held all the way: its first step is to disbelieve
"it needs a fleet / corpus / venv", and that premise was **false eleven times out of eleven**. In every
case the gate needed the SUBJECT of its claim, not its production input:

| gate | premise | what was true |
|---|---|---|
| `rules:gate` | needs `runs/` | `tally`, `verdictOf`, `falsePositiveFailures` are pure over records |
| `scorer:shortcuts` ×2 | needs weights AND corpus | true of producing rows, false of judging them |
| `training:evaluate-acceptance` ×2 | needs 104 captured records | `metrics()` is pure over four small arrays |
| `eval:gate` | needs the venv | true of the 34 fixtures, false of `evaluateFitness` |
| `promote:gated` | needs a candidate | `releasability()` was already pure and already tested |
| `gate:isolation` | needs a train/test split | **it does not check splits at all** — the register's own description was wrong |

`release:gate` is proven by COMPOSITION, and that is a containment claim, so it is verified rather than
asserted: a test walks its ten stages and fails if any is not itself proven. Mutation-checked by
un-proving one, which reports *"1 of its 10 stage(s) are not themselves proven: eval:gate"*.

**Two entries are honestly partial and say so in the register itself** — `promote:gated` proves the
decision and not the weight-copying, `eval:gate` proves the verdict and not the fixture run. A register
that overclaims is worse than one with a gap: the gap is something a person can pick up.

### A2. ~~Idempotency is claimed and unasserted~~ — DONE

`lab:pipeline` tells the operator *"every stage is idempotent, and a stage that already succeeded either
hits its cache or re-runs cheaply."* That is advice people act on — it is why you re-run the whole chain
rather than resuming by hand — and nothing asserted it.

Arrived at by asking what could break the claim INVISIBLY: a stage that APPENDS rather than replaces. A
re-run would silently double the corpus, and every downstream gate would pass on it, because the data
stays numeric and the right shape throughout. *Building ML Powered Applications* names that as ML's
distinguishing failure mode.

**Checked before writing anything, and the pipeline is clean today.** Nothing appends except the
`everything` transcript, which is truncated at the start of each run so it cannot accumulate. Now
asserted rather than true by luck:

- no lab stage may append, DISCOVERED across `src` and `scripts` rather than from a list somebody must
  remember to extend;
- the one exception carries the truncation that makes it safe, and the two travel together;
- the runner does not mutate its own stage list, so the second run sees what the first did.

The cache half was already covered: `capture-cache.test.ts` proves the key is stable under object-key
order and across repeated calls, which is what makes a re-captured case a hit rather than fresh work.

**A test of mine was wrong before the code was.** The truncation assertion compared SOURCE positions of
`rmSync` and `appendFileSync` — and matched the *import* on line 24, so it was measuring where a symbol
is imported rather than where anything happens. The append itself sits inside a function defined above
`main` and called from within it. Execution order and source order are different questions; the honest
textual proxy is the `pipeline(` call.

### A3. No distribution tests on the exported dataset

The corpus audits check labels against evidence. Nothing checks the SHAPE of the export: field presence,
types, ranges, null rates, class balance. The ML Test Score's data section and *Building ML Powered
Applications* both put this first, and its absence is how "a pipeline can run with no errors and produce
an entirely useless model".

**Done when** an export with a null-flooded field, a collapsed class balance, or a missing feature column
is refused by a command, and the refusal names the field.

## Phase B — the capture path

### B1. ~~The focus probe cannot see a cycling modal trap~~ — DECLARED

Closed by the second half of its own done-condition: *"or the limitation is declared in
`screenreader-coverage.md` as a behaviour we do not drive."* It now is, in the 2.1.2 section where the
rule's conservatism is already discussed rather than in a list of gaps — the sharp fact belongs next to
the rule it constrains.

The sharp fact, which was NOT previously written down: `stalled` requires the SAME control to repeat, so a
trap that lets focus cycle among a modal's own controls reads as `cycled` — identical to a conformant page
whose Tab order wraps. **A genuine 2.1.2 failure and a correct page produce the same shape.** The rule is
right to refuse; the evidence is not there.

Not built, and the reason is recorded rather than implied. The direct route — press Escape, see whether
focus leaves — collides with Escape being NVDA's own way out of focus mode, so a probe pressing it moves
two things at once. The cheap route — compare the cycle's size against `domCensus.formField` — needs no
new keystroke and uses evidence already captured, but would miss a trap in a modal holding most of the
page's controls. Both are written down so the next person does not re-derive them.

### B2. ~~`graphicUnnamed` is a COUNT~~ — DONE

`rules:real-pages` reported `graphicUnnamed=2` and could not say WHICH images. Settling cqc.org.uk meant
fetching the page by hand and tallying `<svg>` elements without a `<title>` — this repo's own rule ("a
count is where an investigation stops") applied to its own report.

The census now names them, DOM-side, because an unnamed node has by definition no name to identify it by:

```
census heading=41 ... graphicUnnamed=2 | DOM heading=54 ...
       unnamed graphics: img logo.png .brand, svg .icon
```

Capped at five with the full count beside it — a truncated list that reads as complete is the defect one
layer along.

**A diagnostic mark, not evidence**, so `CAPTURE_PROTOCOL_VERSION` stays at 6 and the cached captures
survive. The `evidence/verify` reader was widened in the same change, so producer and consumer agree
about what a census contains rather than one of them guessing.

**The page-side JS is now the only thing here with its own test harness, and it needed one.** The census
expression is a STRING sent to `Runtime.evaluate`: tsc never parses it, ESLint never sees it, nothing
imports it — so a typo fails at runtime, on a worker, mid-capture, as a null census that reads exactly
like a page exposing nothing. `dom-census-expression.test.ts` extracts it and runs it against a synthetic
DOM, which is the page-side equivalent of this repo's `node -e "import(...)"` rule for `.mjs`.

### B3. ~~Real-page captures never checkpoint~~ — DONE

50 calibration pages at ~191 s each is ~32 minutes across five workers, and a kill lost all of it. The SRE
Workbook names checkpointing as the pattern for exactly that.

**A window, not a flag, and the distinction is the whole design.** A cache reuses a capture because the
URL matches, which these pages must never do — *"a cache hit here would silently pair today's claim
against yesterday's page."* `--resume` reuses one only while it is recent enough to belong to the SAME
measurement, so a corpus scored as one thing cannot quietly be two. Six hours: long enough to survive a
kill, a fleet repair and a re-dispatch, short enough that a publisher's overnight deploy falls outside it.

Four refusals, all mutation-checked: outside the window, no timestamp, an unparseable timestamp, and a
timestamp in the FUTURE — clock skew between lab and worker would otherwise pass the window test
trivially and reuse evidence of unknown provenance.

The run reports against the WHOLE role rather than what this invocation took, because a resumed run
saying `3/3 captured` is true of the run and a lie about the corpus.

**Two things the wiring caught that an import check could not.** `readdirSync` and `readFileSync` were
unimported and the module still loaded cleanly, because they are used inside a function — the limit of
this repo's `node -e "import(...)"` rule, worth knowing. And the corpus directory holds
`abstention-sweep*.json` beside the captures; the reader ignored them by returning an empty URL that
matched nothing, which is accidentally safe rather than deliberately. It now identifies a capture by
SHAPE, as `capturesIn` does, for the reason that one gives: a name convention is a second thing to keep
in step.

## Phase C — the corpus and the dataset

### C1. ~~Three focus subtypes carry a free veto~~ — DONE, verified end to end

`bare-edit-inert` is `bare-edit` with `tabindex="-1"`: an unnamed field in the accessibility tree that
adds no tab stop, so a focus-order host can carry it without its channel moving.

**Both halves are now settled by a full chain run.**

| | |
|---|---|
| does it perturb the channel? | **No.** `check-signals`: 0 blind, 0 contaminated — the host signals still fire |
| does NVDA's `f` quick-nav reach a non-focusable input? | **Yes.** `corpus:grants-audit`: `bare-edit-inert: 5/5 carry bare_edit_present` |
| did the veto close? | **Yes.** Those three heads went from 10 vetoes to 9, and `form_field_unnamed` is gone from all of them |

The unknown was a question about NVDA rather than about the markup, and the gate built for exactly that
claim answered it. Worth noting the shape: the defect carried its own instruction to DELETE it if the
feature was not granted, so a null result had a defined outcome rather than an argument.

**Substituted inside the filter, not added to `ROTATIONS`** — that choice is
`(rotation + round) % length`, so enlarging the list re-rolls every multi-defect pairing in the corpus.
Measured: 5 added, 4 renamed, 1 existing page moved. Ten captures against a full recapture.

**What is left, and it is a different feature.** `vague_link_without_context` is now the worst veto on
those heads (−16 to −20). `vague-link` is excluded from focus-order criteria for a reason that has no
`tabindex="-1"` escape: a link IS a tab stop by nature, and making one unreachable is a different defect
that would collide with 2.1.1's own signal. That is a genuine remaining limitation, not an oversight.

### C2. ~~Eleven signal types have no fixture~~ — DONE, 10 of 15 covered

Was 4 of 15 synthetic with 11 exempt. Now **4 synthetic + 6 from real evidence**, with 5 exempt and each
carrying a reason that names what is missing rather than what is hard.

The six came from captures NVDA actually produced, trimmed to the fields their predicate reads and
**committed** — which is the whole point. A test that reads `runs/` skips where the corpus is absent, and
a test that skips vouches for nothing. This is the SRE Workbook's stated fallback for when synthetic
testing is impossible: *"a running system that exports well-known metrics"*, frozen into 19 KB.

The extraction asserted that trimming did not change either verdict, so what is stored discriminates for
the same reason the full capture did — a fixture cut down until it stopped proving anything would
otherwise be indistinguishable from one that still does.

**The five that remain are all focus-probe types, and that is one fact rather than five.** Each reads
`interaction.focusOrder` or the probe's diagnostic mark, and this corpus copy carries neither for them —
the cases are recent and `probeFocus` evidence is absent from the captures on disk. Six siblings WERE
fixtured in the same sweep, which is what makes it a gap in the EVIDENCE rather than in the method. The
way in is the same extraction, run once a corpus with focus evidence exists.

Two mutations, both caught: a stored fixture that stops discriminating, and a real predicate going dead.

## Phase D — the model and the release

### D1. ~~No canary before publish~~ — DONE, and the premise was half wrong

The plan said *"there is no intermediate state where a real consumer exercises the new weights before
everyone gets them."* **False, and that makes eleven premises challenged and eleven found wrong.**

`action-smoke.yml` already drives the Action exactly as a consumer does — `uses: ./`, inputs only, no repo
knowledge — and already triggers on every push under `packages/scorer/**`, which is where the weights
live. Promoting weights has always run the consumer path.

**What was missing is that nothing REQUIRED it.** `release.yml` ran `release:gate` and `gate:isolation`
and never asked whether the consumer path had passed. Two workflows both being green is not one gating the
other, and a publish could be dispatched while `action-smoke` was red or had never run for that commit.

So the fifth guard is a QUERY, not another run: re-running the smoke test inside the release job would be
a second execution of the same thing on the machine that wants to publish — a verification sharing a
failure mode with the action it guards, which this workflow's own header already states four times over.

Fails closed, including on `none`, and **including in dry run**: a dry run exists to say whether the real
one would work, so passing while the consumer path is red is the one lie this workflow must not tell.

Pinned by `release-safety.test.ts` as guard 5 and mutation-checked four ways — remove the step, unpin the
commit, gate it on dry-run, or make the refusal soft. **Two of my first three assertions did not catch
their mutation**: an alternation matched a surviving `sha=` assignment after the query lost `--commit`,
and the dry-run check read the text BEFORE the step, so adding `if:` inside it changed nothing. Both now
read the STEP. Caught by mutation, never by reading.

### D2. ~~Nothing knows how the scorer behaves on a consumer's pages~~ — DECIDED, and recorded as a decision

Closed by the second half of its own done-condition: *"or a decision recorded that this project will not
collect that."* Written into `SECURITY.md`, beside the promise it constrains, because "we have not built
telemetry yet" and "we are not going to" look identical from outside and only one is a promise.

**The cost is real and is stated rather than argued away.** The scorer is calibrated against 94 real pages
from five publishers, and a page shape absent from that set could be mis-scored systematically without
anyone learning. Every published rubric for a production model asks for this feedback loop — it is the
missing item that pins the Monitoring section of our ML Test Score at ~3, which is the score.

It is still the wrong trade. This tool is aimed at pages behind an organisation's authentication and the
transcript IS the page's text: a report carrying enough to be useful carries that, and one stripped until
it is safe says nothing about the finding it came from.

What bounds the risk instead — the reason this is a decision and not a gap left open:

- **`cantTell`.** A model finding carries no `mapping`, and absent means `secondary`, so it is a referral
  and never an assertion. The layer that ASSERTS is deterministic and measured at 0 false positives over
  1,183 conformant records. A model wrong about somebody's page produces a question.
- **The proxy population**, scored through the product path, with ASSERTED-WRONGLY reported separately
  from REFERRED — which is the number that matters and the one that was collapsed for a day.
- **The abstention floor**, so a page outside support is abstained on rather than guessed at.

### D3. `.mjs` typechecking — 51 of 105, and the remainder is now DECLARED

Was 27 this morning. The floor may only rise and `typecheck-coverage.test.ts` enforces it.

Every batch has found real defects — a worker name that could print as the string `"undefined"`, a widened
`["good","bad"]` that permitted a third variant, two consumers passing `string | undefined` into a lookup,
an async function whose declared return was its resolved value.

**The remainder is 54 files and 1,796 errors, and it is declared rather than left open**, which is this
entry's stated alternative done-condition. The shape of it is the reason:

| errors | code | what it is |
|---|---|---|
| 944 | TS7006 | a parameter with no annotation |
| 428 | TS7031 | a destructured binding with no annotation |
| 123 | TS2339 | a property read off a value that may not have it |
| 68 | TS18046 | a caught value used without narrowing |

**The first two are 76% of the total and they are not independent.** These are duck-typed `.mjs` modules
whose callers pass partial objects, so annotating a function propagates into every caller and its tests —
measured on `capture-decisions.mjs`, where five annotations turned 8 errors into 21 across two files, all
of them real disagreements about what a value is. That is worth doing and it is a DESIGN pass on each
module's interface, not a mechanical sweep. Treating it as mechanical is what makes it look cheap and stall.

**The order to take them in**, since consequence is not evenly spread: `capture-core.mjs` (219) and
`capture-decisions.mjs` are the capture path, where `captureFault(code, message)` was called as
`(message, code)` at two sites for as long as those faults existed and TypeScript would have rejected it.
`case-matrix.mjs` (284) is the largest and the least urgent — it is generated data, and
`furniture-spread.test.ts` and `check-signals` already assert the properties that matter about it.

**Two approaches that do NOT work**, unchanged: a file allowlist cannot isolate, because TypeScript
follows imports and `checkJs` is program-wide; and `allowJs` in the ROOT config drags every `.mjs` into
the main program, where `@ts-check` then fails under strict (0 → 290).

### D4. Publishing — DONE to its boundary; the last step is a human's BY DESIGN

Everything that can be verified without publishing has been, today:

```
changeset:status   clean — major @a11y-witness/scorer, patch judge + a11y-witness
gate:isolation     every package installs and runs from its tarball, outside the repo
scorer:verify      safetensors only; no executable-on-load artefact
release:gate       PASS on the lab, all ten stages
action-smoke       the consumer path, now REQUIRED by release.yml as guard 5 (D1)
```

**The two remaining acts are deliberate human ones, and the workflow is built so they cannot be
automated away.** `.changeset/config.json` says `"access": "restricted"`, so even a correctly-confirmed
run fails at the publish step; and `release.yml` needs `dry-run: false` plus a typed confirmation string.
Its own header says it: *"Removing any of the five is a deliberate act. Do not remove them in the same
change that first uses this."*

Doing either on someone's behalf would be removing a guard — and npm versions cannot be unpublished after
72 hours, only deprecated, so a wrong first release is permanent. This item is complete in the only sense
available to it: nothing automatable is left, and the decision is surfaced rather than buried.

---

## The score, rescored

The plan's own last instruction. Same rubric, same rule — the score is the MINIMUM of the four sections.

| section | was | now | what moved |
|---|---|---|---|
| Features and Data | ~4.5 | **~5** | `corpus:distribution` — the first check here with an opinion about the DATA, and it runs inside `release:gate` |
| Model Development | ~4.5 | ~4.5 | unchanged |
| ML Infrastructure | ~5 | **~5.5** | the canary is now REQUIRED, not merely present; 16 of 16 gates watched failing |
| **Monitoring** | **~3** | **~3.5** | data invariants now tested both sides; the served-prediction item is DECIDED against rather than pending |

**ML Test Score ≈ 3.5, up from ≈ 3** — into the band the paper calls *"strong levels of automated testing
and monitoring, appropriate for mission-critical systems."*

**And the ceiling is real.** Three of Monitoring's seven tests are about a model SERVED with live traffic,
which this one is not — it ships inside a CLI. Under the minimum rule that caps the whole score at roughly
5 for this product shape, and no amount of data or model work moves it. D2 records why collecting the
missing signal would cost more than it is worth, and what bounds the risk instead.

---

## How to work this list

1. **Phase A first.** It is all offline, it is the cheapest, and it is where the last nine defects were.
2. **Re-test a "cannot" before accepting it.** Seven for seven so far.
3. **Prove each fix by making it fail** (`proving-a-gate.md`), and record which mutation caught which
   assertion — that is what separates a proof from an exercise.
4. **Update the score.** The four section scores at the top are the measure; the minimum is the number.
