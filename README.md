# a11y-witness

[![lint](https://github.com/DanBeckDev/a11y-witness/actions/workflows/lint.yml/badge.svg)](https://github.com/DanBeckDev/a11y-witness/actions/workflows/lint.yml)
[![capture-regression](https://github.com/DanBeckDev/a11y-witness/actions/workflows/capture-regression.yml/badge.svg)](https://github.com/DanBeckDev/a11y-witness/actions/workflows/capture-regression.yml)
[![licence: AGPL-3.0-or-later](https://img.shields.io/badge/licence-AGPL--3.0--or--later-blue)](./LICENSE)

**a11y-witness drives a real screen reader (NVDA) through a web page and reports the barriers a screen-reader user would hit.** Every finding cites a WCAG criterion and quotes the announcement it rests on, so you can check it yourself.

The findings it is *for* are the ones a rule scanner structurally cannot produce, because they need a screen reader and an interaction — not markup analysis:

> axe tells you an ARIA attribute is wrong. This tells you your form rejects input and **never announces why**, or your filter updates results and **says nothing**.

**A finding comes in one of two kinds, and the difference is the point.**

*Asserted* — the evidence decides it, so the tool states the criterion is not satisfied. A control that
announced `collapsed`, was activated, and still announces `collapsed` has contradicted itself; there is no
second reading. These come from the deterministic rule layer, which is exact on every criterion it owns with
**zero false positives across 1,183 conformant records**, re-verified by `npm run rules:gate` on every push.

*Referred* — the evidence is suggestive and the judgement is a human's. Whether a link named "Details" is
adequate depends on context WCAG itself says may be off-screen; the tool reports `cantTell` in ACT and EARL's
own vocabulary, quotes the announcement, and points you at it. Measured on 18 real pages whose publishers
declare them conformant: **0 criteria asserted wrongly, 4 referred.**

That split is deliberate. The trained scorer of our own is what does the referring — it **abstains** on pages
unlike its training data and reports those criteria as *unchecked, not clean*, and it has **measured blind
spots** on the criteria it rather than the rules decides. See
[Known limitations](./RELEASE.md#known-limitations-stated-plainly) and
[ADR 0021](./docs/adr/0021-the-layer-that-decides-must-be-the-layer-allowed-to-claim.md).

It is three things: a testing pipeline, the reproducible screen-reader infrastructure that makes it runnable by anyone, and an accessibility model of our own being trained on the evidence the first two produce. The first two are what ships and works; the third is real, measured, and not yet carrying real pages.

It is not a rule scanner, and it is not a wrapper around one. Rule engines automate the mechanical layer well — Deque reports [axe-core](https://github.com/dequelabs/axe-core) finds about 57% of WCAG issues automatically and flags the rest for human review. That remainder is largely the **lived experience**: whether what a screen reader announces, as someone reads and operates the page, adds up to something a person can use.

This project takes that remainder in two halves. Where a screen reader's own output settles the question, it
**witnesses and asserts** — tirelessly, reproducibly, on failures no static analysis can reach. Where the
question genuinely needs a person, it **does the triage instead of the judging**: it finds the moment worth
looking at and hands over the announcement it rests on. It is not trying to replace the judgement; it is
trying to make sure nobody has to hunt for where to apply it.

## Contents

**Using it** · [What it produces](#what-it-produces) · [Quickstart](#quickstart) · [Using it](#using-it) · [What it does not do](#what-it-does-not-do)

**Understanding it** · [Three parts](#three-parts) · [The testing pipeline](#part-1-the-testing-pipeline) · [Running a real screen reader](#part-2-getting-a-real-screen-reader-to-run-repeatably) · [The model we are building](#part-3-the-accessibility-model-we-are-building) · [How we know it works](#how-we-know-it-works)

**Working on it** · [Repository map](#repository-map) · [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md) · [Documentation](#documentation) · [Status and roadmap](#status-and-roadmap)

## What it produces

A real run against `https://example.com`:

```
a11y-witness report
===================
URL:   https://example.com
Task:  Read and understand this page

-- Rule-based layer (axe-core): contrast, colour, ARIA, parsing --
0 violation(s):

-- Lived-experience layer (NVDA + AI judge): 4 announcements --
Task completable: yes (overall confidence 0.96)
The screen-reader user can read and understand the page, though the "Learn more" link has unclear purpose.
1 finding(s):
  Navigate — can the user move through the page?
    [MODERATE] 2.4.4 Link Purpose (In Context) (A)  (confidence 0.94)
       The link text "Learn more" does not clearly convey its destination or purpose in context.
       evidence: 4. link, Learn more
```

The `evidence` line is the point. Findings are grounded in a transcript of what NVDA actually said, so a human can confirm or reject each one. Here is a real transcript pair from the fixture suite — the same page with and without alternative text:

```jsonc
// good
["heading, level 1, Project update",
 "The garden project added a shaded seating area.",
 "graphic, A shaded seating area beside the community garden"]

// bad — the illustration has no alternative text
["heading, level 1, Project update",
 "The garden project added a shaded seating area.",
 "graphic, To get missing image descriptions, open the context menu."]
```

Findings are ordered along the screen-reader experience waterfall — **Perceive → Navigate → Interact** (Firth, *Practical Web Accessibility*) — so barriers that stop someone perceiving content come before ones that stop them operating it.

## Three parts

The project is three pieces of work, each useful on its own:

| | what it is | state |
|---|---|---|
| **1. The testing pipeline** | Drive a real screen reader through real navigation, judge the transcript, report WCAG-cited findings. Optionally alongside axe-core, for the visual criteria a screen reader cannot perceive. | **Working end to end** |
| **2. Reproducible screen-reader infrastructure** | Screen readers are OS-bound desktop apps that cannot be containerised. Getting NVDA running, unattended and repeatably, is a genuine engineering problem — so it is solved as a first-class part rather than a prerequisite chore. | **Working**: scripted VM build, one-command Windows bootstrap, CI path |
| **3. An accessibility model of our own** | A model that judges screen-reader evidence against WCAG criteria, trained on paired captures the other two parts produce. | **In development** — dataset being collected, nothing trained yet |

They compound. Part 2 makes part 1 reproducible by anyone; parts 1 and 2 together generate the labelled evidence that part 3 needs, which no public dataset provides — because the training signal here is *what a screen reader announced*, not HTML.

## What it does not do

- **It does not tab through the page and call that a screen-reader test.** Tabbing reaches interactive controls only; it skips how screen-reader users actually read and explore. Modelling real navigation — browse mode, jumping by heading and landmark, operating controls — is the whole point.
- **It does not judge what a screen reader cannot perceive.** Contrast, colour and target size come from the rule-based layer. We do not reimplement those rules or pretend to see them.
- **It is not a compliance certificate.** It produces evidence and cited, confidence-scored findings for a human to act on. Overlay vendors lost the market — and drew an FTC fine — by over-claiming, and [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) is an honest audit of where our own evaluation is and is not validated.
- **It does not claim to reproduce what it is like to be blind.** It reports the screen-reader navigation experience judged against success criteria. Disability-simulation framing misleads, and screen-reader users themselves navigate in divergent ways.
- **It is one page, not an evaluation of your site.** W3C's evaluation methodology ([WCAG-EM](https://www.w3.org/TR/WCAG-EM/)) evaluates a whole product: a structured sample covering every common view and essential function, plus a random sample of 10% on top, and every page of a complete process. This tool examines the URL you give it. It ASSISTS an evaluator doing that work; it does not replace the sample, and running it once does not evaluate a site.
- **It will never give you a score.** No percentage, no grade, no "87% accessible". WCAG-EM warns that aggregated scores "can be misleading", and a single number is exactly what gets quoted out of the context that makes it meaningful — while the criteria we could not check are the part a score silently absorbs. You get per-criterion outcomes in the W3C's [ACT](https://www.w3.org/TR/act-rules-format/) vocabulary instead: failed, passed, inapplicable, cantTell, untested. `report.test.ts` asserts no score is ever printed.
- **Where neither layer can decide, it says so.** Whether alt text is *accurate* rather than merely present, or whether a reading order is *meaningful*, goes to a human — the way axe flags "incomplete". We do not silently claim coverage we do not have.

## Part 1: the testing pipeline

Capture is operating-system-bound, so it is split from everything else:

```
  your machine (any OS)                         Windows worker
 ┌──────────────────────────┐                 ┌────────────────────────────┐
 │ witness CLI              │  POST /capture  │ NVDA + Edge                │
 │  ├─ axe-core (optional)  │ ──────────────► │  browse-mode read-through  │
 │  └─ AI judge             │ ◄────────────── │  quick-nav by element type │
 │      rules + gate        │   transcript    │  operate controls          │
 └──────────────────────────┘                 └────────────────────────────┘
```

The worker quick-navigates the way a screen-reader user does — headings, landmarks, form
fields, images, links and lists — then operates the controls it finds, because a state change
only exists once something is activated. Tab-order traversal and cell-by-cell table reading are
opt-in per capture. **[`docs/screenreader-coverage.md`](./docs/screenreader-coverage.md) is the
map of what we drive and what we do not** — a behaviour missing from that table is not a missing
feature, it is a claim this project cannot yet make.

- **Capture worker** (Windows): drives **NVDA** via [Guidepup](https://github.com/guidepup/guidepup) through real navigation and returns the announcement transcript over HTTP. Speech is read over NVDA's Remote Access channel, not audio, so the machine needs no sound device. See [`packages/nvda-worker/src/`](./packages/nvda-worker/src/).
- **Control plane** (anywhere): the `witness` CLI runs the capture and — if the optional axe layer is installed — axe-core concurrently, then judges the transcript and prints the report. Architecture rationale: [`docs/adr/0001-capture-architecture.md`](./docs/adr/0001-capture-architecture.md) and [`0002-layered-coverage.md`](./docs/adr/0002-layered-coverage.md).

### The judge is a hybrid

No single model handles every WCAG criterion well, so a generative pass drafts findings from the transcript and two layers refine them:

- **Deterministic rules** (always on, [`packages/judge/src/rules.ts`](./packages/judge/src/rules.ts)) own the *absence-of-name* criteria — an image announced with no alternative text (1.1.1), a control announced as a bare role with no accessible name (4.1.2). These are facts, not judgement calls, so a rule catches them exactly, for free, with no false positives.
- **A discriminative gate** (opt-in, [`packages/judge/src/verify-gate.ts`](./packages/judge/src/verify-gate.ts)) re-scores the *semantic* findings — vague link text (2.4.4), non-descriptive headings (2.4.6) — with a small encoder (DeBERTa-v3 NLI, ONNX) via [transformers.js](https://github.com/huggingface/transformers.js). A discriminative model *scores* a candidate rather than *generating* one, so it cannot invent a finding, which removes the over-flagging small generative models show on clean pages.

The model call itself is one seam (`ask()` in [`packages/judge/src/judge.ts`](./packages/judge/src/judge.ts)):

| `JUDGE_BACKEND` | needs | notes |
|---|---|---|
| `local` (default) | our own trained scorer | no LLM, no key, nothing leaves the machine |
| `codex` | local Codex login | comparison only; no metered API cost |
| `anthropic` | `ANTHROPIC_API_KEY` | optional `JUDGE_MODEL` |
| `openai` | `JUDGE_BASE_URL` | hosted OpenAI **or** any local engine (llama.cpp, vLLM, Ollama, LM Studio) |

The `openai` backend makes a self-hosted, zero-cost judge realistic. Measured against a local **Qwen3.6-27B (Q4)** on the W3C subset: it caught the high-signal criteria and produced no false positives on the clean reference page — the main risk with a small model — missing only the most judgment-heavy criterion (1.4.5). That was a subset, not the full suite, and not the interaction cases; see [`PLAN.md`](./PLAN.md) for the caveats.

## Quickstart

**The shortest path needs no hardware: a GitHub Action on a Windows runner.** A screen reader is an
OS-bound desktop application, so something has to run Windows — but it does not have to be yours.

```yaml
jobs:
  a11y:
    runs-on: windows-2022          # NVDA needs Windows; GitHub hosts these
    steps:
      - uses: DanBeckDev/a11y-witness@main
        with:
          url: https://example.com/checkout
          task: Complete the checkout
```

That is the whole thing. **No API key and no account** — `judge-backend` defaults to `local`, this
project's own trained scorer, which ships in the repo and never sends your page anywhere. Findings appear as
a PR comment; `fail-on` decides whether they also fail the build, and defaults to `never` so adding it
cannot break your pipeline on day one. `.github/workflows/action-smoke.yml` runs exactly this shape against
two W3C pages on every push, as a consumer would.

**→ [Full getting-started guide](./docs/getting-started.md)** — including running it locally.

### Locally instead

Local runs need a capture worker: a Windows machine running NVDA that you control. Check what you have —
every failure names its own fix:

```bash
npm run doctor              # VM, worker, page server, judge, unfinished runs
npm run doctor -- --json    # same, machine-readable
```

```bash
npm install                        # Node 20+
npm run witness -- https://example.com --task "Find the contact details"
```

No login step: the default judge is local. `JUDGE_BACKEND=anthropic|openai` swaps in a rented model and
needs a key of your own.

**If that last command cannot reach a worker, nothing happens** — and a worker is a
Windows machine running NVDA, not a flag you can pass. That is inherent: screen readers
are OS-bound desktop applications, so there is no Docker image that runs this whole
product. Getting one takes ~20 minutes on a Windows box you already have, or 1.5–2 hours
to build a VM from scratch on a Mac. [The guide](./docs/getting-started.md) walks all
three routes. **If you have no Windows machine, use the Action above** — a GitHub-hosted
runner is one.

Add `--json` for machine-readable output and `--debug` for per-phase capture diagnostics.

To test how a page *behaves* when operated, add `--probe-forms`: the worker submits the form with no valid input and records what is announced, catching forms that fail silently — the error shown visually and never announced (3.3.1 Error Identification, 4.1.3 Status Messages). In the CLI this is opt-in because activating a submit button has side effects on a page you may not own; in the GitHub Action it is **on by default**, because a workflow tests your own application and reviewing a page means checking what is on it. Disclosure controls are always activated, to check the expanded/collapsed change is announced at all (4.1.2).

**The axe-core layer is optional.** It is ~100 lines and about a second, but it pulls half a gigabyte of Chromium, which is a poor trade if you already run axe in your own pipeline — and two differently-versioned axe runs in one CI produce duplicate findings, which is worse than none. So `playwright` and `@axe-core/playwright` are `optionalDependencies`: skip them and the rule-based layer simply does not run. Turn it off explicitly with `--no-axe` or `A11Y_AXE=0`. The report then says *"not run. Visual criteria are unchecked, not clean."*, because silence must never read as a pass.

**Better still, feed it the axe run you already have:**

```bash
npm run witness -- https://example.com --axe-results ./axe.json
```

You keep your own axe, at your own version, on your own schedule; we consume its output and still print the two-layer report — no second scan, no Chromium, no duplicate findings. It accepts what the common tools emit (`{ "violations": [...] }`, the axe CLI's array of those, or a bare violations array) and maps them through the same code as our own run, so a finding cannot differ by who scanned. If the file records a `url` that disagrees with the page you are testing, it says so.

## Using it

Running it is one command; getting value out of it is a few habits.

**Give it a real task.** `--task` is not a label — task-completability is judged separately from the criteria, so "Find the contact details" produces a usable answer and "test accessibility" does not. Use the words a user would.

**Read a finding as a claim plus its evidence.**

```
    [MODERATE] 2.4.4 Link Purpose (In Context) (A)  (confidence 0.94)
       The link text "Learn more" does not clearly convey its destination or purpose in context.
       evidence: 4. link, Learn more
```

`evidence` points at a line in the transcript. **Check it.** Run with `--json` to get the full transcript and find that line. If a finding's evidence is not in the transcript, that is a bug in this tool, not a defect in your page — please report it.

**Fix in the order it prints them.** Findings are grouped Perceive → Navigate → Interact. Something a user cannot perceive outranks something they cannot operate, because the second doesn't matter if the first blocks them.

**Treat confidence as ordering, not probability.** It has not been calibrated against outcomes yet ([`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) is explicit about this). Use it to sort, and treat anything below ~0.7 as "a human should look", not "70% likely true".

**Expect the false positives where they live.** They concentrate in the two subjective criteria — link purpose (2.4.4) and descriptive headings (2.4.6) — which is exactly why those are the fine-tune target for part 3. A finding you can disprove from the transcript is one you should dismiss.

**"0 announcements" is a broken worker, not a clean page.** The CLI warns when this happens. Run `--debug` and read `documentReady` first; [`docs/nvda-worker-runbook.md`](./docs/nvda-worker-runbook.md) has the error-to-cause table.

**Already running axe? Feed it in rather than running ours.** `--axe-results ./axe.json` keeps one engine, one version, one set of rule findings — and you still get the layered report.

**Where it fits.** This is not a gate to put in front of every commit — a capture takes about a minute of real screen-reader time. It earns its keep on the flows that matter (checkout, sign-up, search), before a release, or as the evidence base for an audit. Keep your rule scanner where it is, on every commit, doing the fast mechanical layer.

## Part 2: getting a real screen reader to run, repeatably

This is not a footnote to the interesting work — it *is* some of the work. Screen readers are operating-system-bound desktop applications, not libraries. VoiceOver cannot be containerised at all; NVDA needs a full interactive Windows desktop, which Windows Server containers do not have. There is no Docker image that runs this product. The reproducible form of NVDA is a **Windows VM**, and a hand-tuned pet VM is not reproducible, scalable or usable by anyone else. So the infrastructure is built and documented as a deliverable. Rationale: [`ADR 0001`](./docs/adr/0001-capture-architecture.md).

| you have | do this | what you get |
|---|---|---|
| a Mac | [`docs/local-worker-vm.md`](./docs/local-worker-vm.md) | A scripted Windows VM: ISO build, unattended install, auto-logon, NVDA provisioning, capture verified — no GUI clicking |
| a Windows box | [`packages/worker-fleet/src/provisioning/bootstrap-windows-worker.ps1`](./packages/worker-fleet/src/provisioning/bootstrap-windows-worker.ps1) | One idempotent script, then `A11Y_WORKER=http://host:8765` |
| neither | [`capture-regression.yml`](./.github/workflows/capture-regression.yml) | Real NVDA on a GitHub-hosted runner, so a contributor needs no infrastructure at all |

Because a Windows guest is never genuinely idle, the pipeline manages it **on demand**: with a local VM and no `A11Y_WORKER` set, a run starts it, captures, and **puts it back exactly as it found it** — stopped stays stopped, paused re-paused, and one you had already started is left running, so a run never shuts down a worker someone else is using. Cold start is 12–15 s. Override with `--after stop|pause|leave|restore`; naming a worker opts out entirely. Between runs, [`worker-ctl.sh`](./packages/worker-fleet/src/local-worker/worker-ctl.sh) does `up | pause | stop | status | idle-pause`.

**Scaling past one worker.** Because captures serialise per machine, throughput comes from
more machines. On a Mac that is one command, and the lifecycle is handled for you:

```bash
./scripts/local-worker/clone-worker.sh          # add a worker (handles a MAC-copying trap)
./packages/worker-fleet/src/local-worker/worker-ctl.sh pool       # what have I got
npm run training:capture                        # uses them all, then puts them back
./packages/worker-fleet/src/local-worker/worker-ctl.sh pool-stop  # or release them yourself
```

Measured: **1.90x on two workers, 2.36x on three**, with byte-identical evidence at each step —
on a quiet host. Treat those as a ceiling, not a promise.

The returns bend because of **host memory**, and this was originally recorded the other way round:
"not on the host, which sits at under 70% of its CPU with three running". The CPU reading was
correct and the conclusion drawn from it was wrong. A worker VM costs the host ~7 GB, not the
4096 MB it is configured with, so three guests is ~21 GB on a 36 GB machine that is also somebody's
desktop. Over-committed, the guests get swapped out from under NVDA: the same page on the same
worker took **44.5 s with three up against 27.4 s with one**, and the swapped-out guests also
produced mute-NVDA failures. Ruling the host out because it had CPU to spare cost a day of
diagnosis, so the pool now sizes itself from `vm_stat`, `npm run doctor` prints what will fit, and
`A11Y_MAX_WORKERS=N` overrides it.

**A worker serves one capture at a time.** One machine has one desktop, one foreground window
and one NVDA, so captures are serialised by design — the worker returns `429` while busy.
Throughput scales by running more workers, not more threads ([ADR 0001](./docs/adr/0001-capture-architecture.md)).
It also means a second shell or agent driving the same worker will see your restarts as
breakage; `worker-ctl.sh status` is the arbiter.

When a worker breaks, the error messages lie — `"NVDA not installed"` usually means a version mismatch, not a missing install. [`docs/nvda-worker-runbook.md`](./docs/nvda-worker-runbook.md) maps error string to actual cause, and [`packages/worker-fleet/src/provisioning/diagnose-nvda-worker.ps1`](./packages/worker-fleet/src/provisioning/diagnose-nvda-worker.ps1) applies that table automatically across six layers.

## How we know it works

Verification is layered, and each layer tests something the others cannot. There are unit tests
(`npm test`, 22 of them) for the pure functions — the deterministic rules, the judge layers, eval
fitness — and CI gates on them; everything below exists because most of this system cannot be
unit-tested, since a real screen reader on a real desktop is the thing under test.

| command | what it checks |
|---|---|
| `npm run lint` / `npm run typecheck` | mechanical; both gate CI |
| `npm run eval` | judge quality against **34 labelled fixtures** — W3C tutorial pages and paired good/bad cases. Runs against our own scorer by default; needs the Python venv, so it cannot run in CI |
| `npm run rules-check` | the deterministic rules in isolation. Exits non-zero on **any** false positive against a conformant page — precision is the entire point of a rule |
| `node packages/nvda-worker/src/capture-check.mjs` | the capture half, on the worker itself. Asserts probe *values*, not just that a probe fired — a check that only asserts "it ran" stays green while the evidence is garbage |
| `capture-regression.yml` | real NVDA on a GitHub-hosted Windows runner |

**On the numbers.** The suite currently reports full recall on the observable failure cases with a small number of false positives, concentrated in the subjective link-purpose (2.4.4) and descriptive-heading (2.4.6) criteria. Treat that as *promising, not validated*, and read [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) before quoting it anywhere: the guards were iteratively tuned against these cases, scoring is single-run with no test-retest interval, and **there is no expert human-agreement baseline yet**. That document sets the bar for "trustworthy enough" *before* measuring against it, and lists what is still missing — deliberately, so the goalposts cannot move.

The strongest evidence so far is structural rather than a number: the judge sees the **transcript, not the page**, so it cannot recall a well-known page's documented issues — it has to point at something that was announced. A page authored fresh and never published ([`packages/lab/src/eval/pages/contamination-test.html`](./packages/lab/src/eval/pages/contamination-test.html)) was caught correctly on all four planted violation categories with no false positives on the correct controls, which is evidence that recall is genuine judging rather than memorisation. One page is not a suite.

## Repository map

A monorepo: everything a consumer installs is under `packages/`, one directory per published package.
`packages/README.md` has the split and the licence of each.

```
packages/
  cli/            the `witness` pipeline — capture -> axe -> judge -> report. Published as `a11y-witness`
  judge/          the deterministic WCAG rules, criterion coverage, and experience-layer ordering
  scorer/         the trained heads, the feature contract, and the Python scoring program
  evidence/       wire types, verification predicates, the WCAG 2.2 AA list. Zero deps, no I/O
  nvda-worker/    the Windows capture worker. Plain `.mjs`, no build step — it runs on the guest
  nvda-speech/    the speech-channel client
  worker-fleet/   host-side lease, health and capacity; provisioning; the Ansible fleet definition
  lab/            PRIVATE. The corpus, the training pipeline, the gates. Ships nothing

docs/             guides, runbooks, and the ADRs.  Start at docs/README.md
scripts/          repo-level tooling — the isolation gate, git hooks
examples/         runnable examples
action.yml        the GitHub Action entry point
```

Two things a newcomer usually looks for:

- **the CLI's entry point** is `packages/cli/src/cli.ts`
- **the deterministic rules** — the layer with zero false positives — are `packages/judge/src/rules.ts`

## Part 3: the accessibility model we are building

**Our own model is the engine, not a rented one.** `JUDGE_BACKEND` defaults to `local`: the trained heads in
`packages/scorer/models/screenreader-scorer/` over a frozen MiniLM encoder. No API key, no metered call, no
data leaving the machine. `codex`, `anthropic` and `openai` remain available for comparison and are never
the default. The reason a model of our own can exist is that parts 1 and 2 manufacture something no public
dataset contains: paired captures of *what a screen reader actually announced* on pages that differ by one
deliberate accessibility defect.

**It is honest about where it stops**, and there are two different limits — one it handles well and one it
does not.

*Abstention* is the one it handles. On a page unlike its training data it declines and reports those
criteria as **unchecked, not clean**. Since the realism tier it scores **20 of 22** held-out real pages with
**0 false accusations**, up from 4–6; the pages it still declines are genuinely out of its range, and
declining is the right answer for them.

*The blind spot is the one it does not.* Measured 2026-08-22, the scorer's heads have learned to penalise
features that were 0 on every one of their training examples — a penalty that costs nothing to learn and
that no accuracy metric we compute can see, because every held-out split shares the corpus's structure.
`npm run scorer:shortcuts` counts **225** of them across all 13 heads.

**How much of that reaches you depends on which layer answers.** Where a deterministic rule owns a subtype,
the rule answers and the scorer is suppressed — so 1.1.1's missing and filename alternatives, 4.1.2's
unnamed controls, and every keyboard and navigation criterion are unaffected. Measured on the three W3C
pages where the scorer's own score is weakest, the rule layer reports the failure on **all three**. The
blind spots land on the nine subtypes the model decides alone, among them vague link text (2.4.4), vague
headings (2.4.6), silent validation errors (3.3.1) and silent state changes (4.1.2). This is a corpus
problem with a corpus fix, and it is in progress —
[ADR 0015](./docs/adr/0015-one-defect-per-page-taught-the-scorer-to-veto.md) has the measurement.

The plan of record is [`docs/local-model.md`](./docs/local-model.md).

### Now: a scorer over captured evidence

Deliberately **not** a general-purpose language model. The project already produces a structured signal, so the useful model is a small **discriminative scorer** answering one question at a time:

> Does this captured evidence support WCAG 2.4.4 Link Purpose?

That model can *score* a candidate finding but cannot invent one, which is the property that matters: a generator that hallucinates a violation destroys the trust the whole project depends on. The division of labour stays as it is — deterministic rules keep the exact absence cases, the scorer takes the judgment calls, and the explanation is rendered from captured evidence and a fixed WCAG template.

It runs through the `applyGate` seam in [`packages/judge/src/verify-gate.ts`](./packages/judge/src/verify-gate.ts). **This is no longer future tense — it shipped and is the default**, and it cleared the pre-registered bar to get there: a criterion's findings are the scorer's only once it meets the holdout bar for that criterion with **zero false positives on the clean paired pages**. Held-out acceptance is currently 58 true positives, 0 false positives, 0 false negatives across all 8 scored criteria.

Where a deterministic rule already decides a subtype, the rule wins and the scorer is suppressed for it — so the exact cases stay exact and the model only carries the judgment calls.

There is a concrete reason this needs its own dataset. Link purpose (2.4.4) is a known weak spot: the zero-shot entailment gate does not separate vague from descriptive link text reliably — validated, they score in overlapping ranges. That is a fine-tune target, not something more prompt-engineering will fix.

### Building the training set

`packages/lab/src/training/` collects screen-reader-only evidence from a source matrix of **1,126 controlled page pairs**, of which 1,061 are captured today, each a known-good page and a mutated one that breaks a single criterion, so a label comes from the contrast rather than from anyone's opinion. Model input is deliberately limited to what a screen reader produced — **no HTML, DOM, CSS, URL or axe findings** — so a model trained on it cannot learn to cheat by reading the markup. The pages are instruments for producing captures and labels; they are not training input.

```bash
npm run training:generate      # write the page pairs + manifest
npm run training:generate-acceptance # write the untouched acceptance pairs
npm run training:capture       # starts/leases the local workers and page server on demand
npm run training:status        # progress, current case, failures, worker health
npm run training:export        # JSONL, only for pairs where the contrast was observable
npm run training:analyze-errors # held-out false positives/negatives with NVDA evidence
npm run training:evaluate-acceptance # acceptance + repeated-capture stability gate
```

A long unattended run publishes its state rather than expecting you to watch a log — and you
can block on it instead of polling:

```bash
npm run training:wait              # blocks until it finishes, exits with the outcome
npm run training:wait -- --json
npm run training:status -- --json  # snapshot: eta_minutes, failures, next_command
```

`wait` watches the progress file rather than polling, and cannot hang on a dead run — if
updates go cold past one capture timeout it exits 3. Exit codes are the contract: **0** clean,
**1** finished with failures, **2** no run recorded, **3** wedged. Both commands emit a
`next_command` field, so a script never has to infer the next step.

`training:status` reports progress and separately asks the worker whether it is still capturing, so *finished*, *working* and *wedged* are distinguishable. A stale run reports `running: false`, `stale: true`, and no misleading ETA. `--resume` picks up only captures whose page identity and provenance still match. See [`packages/lab/src/training/README.md`](./packages/lab/src/training/README.md).

The source matrix contains **1,126 controlled page pairs** — the original 836 plus targeted calibration pairs for image alternatives, fake headings, placeholder-only fields, unnamed icon buttons, validation errors, live status updates, missing-role controls, silent state changes, and the keyboard and navigation cases added for 2.1.1, 2.1.2, 2.4.1, 2.4.2 and 2.4.3, plus 60 pages that fail **two** criteria at once — added because one-defect-per-page is what taught the scorer its 4.1.2 blind spot ([ADR 0015](./docs/adr/0015-one-defect-per-page-taught-the-scorer-to-veto.md)). 58 observable missing-landmark pairs are retained for the structural/signal layer but excluded from the scorer, because that absence is not reliably inferable from screen-reader output alone.

The scorer combines channel-tagged screen-reader evidence with 29 screen-reader-derived structural features, including field-name/role and table-header relationships, then uses one head per violation subtype and max-pools those subtype scores into a criterion score. Thresholds are selected from grouped out-of-fold development predictions rather than in-sample scores, and splits are grouped by page family, template and source so a good and bad version of the same template never straddle train and test — repeated captures of one page do not count as independent examples.

`docs/local-model.md` sets out the planning bands honestly: roughly 100–200 violation and 100–200 clean captures per criterion for a first useful baseline, and 500–1,000+ each for release quality. Training weights are handled under an allowlist policy — safetensors only, pinned revision, recorded licence and hash, no pickle formats, no `trust_remote_code` — enforced by [`packages/lab/scripts/verify-safetensors.mjs`](./packages/lab/scripts/verify-safetensors.mjs).

### Later, and unproven: predicting the announcement

The scorer still needs a real screen reader to produce its input, so every run costs a VM. The further ambition is a model that **predicts what a screen reader would announce** for a page, giving a fast path that needs no VM in the loop — with real NVDA remaining the ground truth that trains it and spot-checks it, never removed.

That is a materially harder claim than scoring evidence, and it is stated here as a direction, not a plan with a date. It is also the reason the dataset is built the way it is: paired good/bad captures of controlled pages are exactly the supervision such a model would need. If it does not pan out, parts 1–3 stand on their own.

## Status and roadmap

Working end to end, and under active development. The core bet is demonstrated: a real screen reader is driven through a real page, and the judge produces grounded, WCAG-cited findings that separate broken pages from accessible ones. What is still open is written down rather than glossed over — the full backlog is [`PLAN.md`](./PLAN.md), the honest evaluation audit is [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md).

**The GitHub Action ships** ([`ADR 0003`](./docs/adr/0003-testing-and-distribution.md)) and is the primary distribution vector — teams drop it into their workflow and get findings on the PR, where accessibility regressions actually happen. Real NVDA runs on a GitHub-hosted Windows runner, the default judge is local so no key is needed, and `action-smoke.yml` exercises it as a consumer would on every push. **What it has not had is a stranger**: nobody outside this project has run it on an application they own, which is the one thing no amount of green CI substitutes for. A hosted layer on top of the open core comes only if the Action proves demand.

**Trust work, in priority order:** an expert-labelled human-agreement baseline (the single biggest gap), confidence calibration measured against outcomes, reported test-retest reliability, and schema-enforced judge output with the model and prompt version pinned per run.

**Coverage.** More screen readers behind the same `CaptureBackend` interface — JAWS (Windows; commercial and the hardest to automate, a deliberate fast-follow), VoiceOver (macOS/iOS; needs a real Mac, and the AppleScript path is fragile), Orca (Linux; the only one that runs headless in a container, which makes it a useful portable dev tier). Then multi-step flows, with Playwright driving the page while the screen reader drives the assistive technology.

**Capture gaps with known fixes.** Announced *language* (3.1.1/3.1.2 — wrong-voice pronunciation is high-impact and invisible to us today), name/role *mismatch* under 4.1.2 (needs both the visible label and the announced name), NVDA's Elements List for bulk enumeration instead of repeated quick-nav, and a pinned NVDA settings profile for cross-version reproducibility.

**Not covered, and not pretended otherwise.** Braille output, magnification and voice control are all real assistive-technology experiences this tool says nothing about. One screen reader in browse mode is *one* valid lived experience, not the universal one.

## Documentation

**[`docs/README.md`](./docs/README.md) is the index** — every guide, runbook and reference, grouped by what
you are trying to do. The four you are most likely to want:

| document | what it is for |
|---|---|
| [`docs/getting-started.md`](./docs/getting-started.md) | **start here**: install, set up a worker by whichever route fits, run your first report, and what to do when it fails |
| [`docs/adr/README.md`](./docs/adr/README.md) | 24 architecture decision records, indexed — the *why*, including the alternatives that were rejected |
| [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) | how the numbers were produced, the biases we are exposed to, and why the eval figures must not be quoted as a headline |
| [`docs/coverage.md`](./docs/coverage.md) | **every WCAG 2.2 A/AA criterion and whether we detect it** — 14 of 55 produce findings, and each partial one names the gap. Generated from the code |
| [`docs/screenreader-coverage.md`](./docs/screenreader-coverage.md) | every behaviour we drive — and **what we do not drive yet**, which bounds what this tool can claim |

For contributors: [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`SECURITY.md`](./SECURITY.md). Read the second
one before pointing this at a page you do not own — it operates controls, and one probe presses buttons.

[`PLAN.md`](./PLAN.md) is the working backlog with what is proven and what is not; [`RELEASE.md`](./RELEASE.md)
carries the known limitations, stated plainly. `CLAUDE.md` is operational instruction for anyone working
*on* the repo rather than using it.

## Licence

Licensed under the **GNU Affero General Public License v3.0 or later** (`AGPL-3.0-or-later`); see [`LICENSE`](./LICENSE). The AGPL's network copyleft means anyone running a modified version as a service must publish their changes, so the project stays genuinely open and a closed hosted fork is not a free ride.

**Commercial licensing.** If the AGPL does not fit — embedding in a closed-source product, or a proprietary hosted service — a separate commercial licence is available; open an issue to start the conversation. A hosted version and enterprise features may sit on top of the open core later, following the standard open-core model.
