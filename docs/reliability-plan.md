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

### A2. Idempotency is claimed and unasserted

Assert what the pipeline runner promises: running a stage twice against unchanged inputs produces an
unchanged result. Cheapest form is a test over the CACHE decision (`capture-cache.mjs` is pure) plus a
`--dry-run` comparison for the stages that cannot be re-run cheaply.

**Done when** a test fails if a stage stops being re-runnable.

### A3. No distribution tests on the exported dataset

The corpus audits check labels against evidence. Nothing checks the SHAPE of the export: field presence,
types, ranges, null rates, class balance. The ML Test Score's data section and *Building ML Powered
Applications* both put this first, and its absence is how "a pipeline can run with no errors and produce
an entirely useless model".

**Done when** an export with a null-flooded field, a collapsed class balance, or a missing feature column
is refused by a command, and the refusal names the field.

## Phase B — the capture path

### B1. The focus probe cannot see a cycling modal trap

Recorded while writing the 2.1.2 case. `probeFocusOrder` presses only Tab and calls a trap `stalled` only
when the SAME control repeats — so a modal that cycles focus among its own controls for ever is a genuine
2.1.2 failure this tool reads as a normal tab wrap. **A real limitation, not a defect**: the honest fix is
to press Escape and observe whether focus leaves, which is a capture-path change and a recapture.

**Done when** a case that cycles within a container is caught, or the limitation is declared in
`screenreader-coverage.md` as a behaviour we do not drive.

### B2. `graphicUnnamed` is a COUNT, and a count is where an investigation stops

`rules:real-pages` reports `graphicUnnamed=2` and cannot say WHICH images. Settling cqc.org.uk meant
fetching the page by hand and counting `<svg>` elements without `<title>`. The repo's own rule —
"a count is where an investigation stops" — applies to its own report.

**Done when** the census records an identifier per unnamed graphic and the report prints up to three.

### B3. Real-page captures never checkpoint

50 calibration pages at ~191 s each is ~32 minutes across five workers, and a kill loses all of it. The
dataset capture resumes; this one does not.

**Done when** `capture-real-pages` resumes, and the resume is proven by killing it mid-run.

## Phase C — the corpus and the dataset

### C1. Three focus subtypes carry a free veto with no remedy available

`form_field_unnamed` is 0 on every positive of `2.1.1:control-unreachable-by-keyboard`,
`2.1.2:focus-trapped` and `2.4.3:focus-order-scrambled`, so each head can penalise it at no cost —
measured at **−4.60 to −6.59 logits**. Real pages frequently have an unnamed field, so the cost is real.

`bare-edit` is the only accompanying defect granting the feature and `PERTURBS_FOCUS_ORDER` correctly
excludes it from the four focus-order criteria: an `<input>` injected into the bad variant only enters the
tab order and corrupts the channel those cases are measured on.

**The untested candidate:** an `<input tabindex="-1">` with no label is an unnamed form field in the
accessibility tree and never enters the tab order. Whether NVDA's form-field quick-nav still reaches it is
the question, and `--pipeline=verify --only=` answers it in minutes.

**Done when** the three subtypes carry the feature on some positives, or the veto is declared permanent
with the measurement behind it.

### C2. Eleven signal types have no fixture

`signal-predicates-discriminate.test.ts` exercises 4 of 15 and exempts 11 with reasons — each reads an
interaction delta, a probe mark, or the announcement grammar, where a hand-built fixture would assert my
model of the probe rather than the probe. The honest way in is a RECORDED capture as the fixture, not a
synthesised one.

**Done when** each exempted type either has a fixture built from a real capture, or its reason has been
re-tested.

## Phase D — the model and the release

### D1. No canary before publish

The biggest structural gap, and both rubrics ask for it. Today: gate, commit, `changeset publish`, and
every consumer gets the new weights at once.

**Done when** there is a state in which the new weights are exercised against real pages by a real
consumer path before the version is public — at minimum, running the shipped GitHub Action against a
known repository with the candidate weights.

### D2. Nothing knows how the scorer behaves on a consumer's pages

The analogue of the rubric's monitoring section for a shipped artefact. `calibrate-abstention` on real
pages is the closest thing and it runs on our corpus, not theirs.

**Done when** there is a documented, opt-in way for a consumer to report what the tool said on their
pages, or a decision recorded that this project will not collect that.

### D3. 56 `.mjs` files unchecked

Was §3. **46 of 102** typechecked, floor may only rise. The remaining ~1,000 annotations are dominated by
four files (`case-matrix` 284, `capture-core` 219, `capture-screenreader-dataset` 120). Every batch so far
found real defects.

**Done when** the floor reaches 102, or the remainder is declared with reasons.

### D4. Five changesets pending publish

Ready. `changeset status` clean, all gates green, MAJOR on `@a11y-witness/scorer` because the weights ARE
the API. Publishing is irreversible and outward-facing, so it stays a human decision — and D1 should land
first.

---

## How to work this list

1. **Phase A first.** It is all offline, it is the cheapest, and it is where the last nine defects were.
2. **Re-test a "cannot" before accepting it.** Seven for seven so far.
3. **Prove each fix by making it fail** (`proving-a-gate.md`), and record which mutation caught which
   assertion — that is what separates a proof from an exercise.
4. **Update the score.** The four section scores at the top are the measure; the minimum is the number.
