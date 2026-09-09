# Documentation

Start with the [README](../README.md) for what the tool is and what it produces. This directory is the
detail behind it. `CLAUDE.md` at the repo root is a separate thing — operational instructions for anyone,
human or agent, *working on* the repo rather than using it.

## Getting it running

| doc | read it when |
|---|---|
| [`roles/worker-loop-orchestrator.md`](roles/worker-loop-orchestrator.md) | **who owns the worker loop, what they hand up, and the measurement that decides whether the split was right.** Created because one agent was the serial step and the measurement said which part |
| [`roles/orchestrator.md`](roles/orchestrator.md) | fleet, lab, `runs/`, gates — and why nothing is checked out in the primary |
| [getting-started.md](./getting-started.md) | you have no capture worker and need one (~1.5–2 h, mostly downloading Windows) |
| [try-it.md](./try-it.md) | you want the shortest honest path to a real run against your own page, before reading anything else — a GitHub Actions run, what to expect from a long marketing page, and the four questions we would like back |
| [local-worker-vm.md](./local-worker-vm.md) | you are a single contributor on a Mac with no other hardware and want the scripted UTM worker. **Superseded by a declared fleet for anyone with more than one machine** — `leaseWorker` already prefers `inventory.yml` over a local VM |
| [control-plane-proxmox.md](./control-plane-proxmox.md) | you have (or are setting up) more than one worker — the bare-metal fleet, and the recommended path over local VMs |
| [github-action.md](./github-action.md) | you want it in CI against your own app |

## What is not done yet

| | when you want it |
|---|---|
| [**not-working.md**](./not-working.md) | **what the tool does wrong, cannot do, or cannot show.** Not a backlog — everything here is a live defect or a measured limitation, each with what was measured and on what. Read it before quoting any number about this project |
| [known-gaps.md](./known-gaps.md) | **the RECORD of what was closed on 2026-08-27**, kept for what each defect cost. Originally the honest list, in the order to do it — what this project does not do or does not yet know, phased by what CONSUMES what: tooling, then the capture path, then the corpus, then the model. Training is LAST because it consumes everything above it |
| [**capture-integrity-plan.md**](./capture-integrity-plan.md) | **the OPEN plan, and the root under all the others: the sweep is treated as a CENSUS when it is a SAMPLE.** Measured across 106 real captures — 97% disagree with the accessibility tree, in BOTH directions (phantom and truncated), 55% open behind a consent banner, 40% carry truncated announcements. The capture already computes the disagreement and nothing reads it |
| [control-plane-plan.md](./control-plane-plan.md) | **the OPEN plan: take the laptop out of the path.** Three wrong diagnoses of a transport fault ended at `pmset` — the gates were driven from a laptop on Wi-Fi whose battery ran 18% to 1% while it lost 9 responses in 40. Measured: the LAB already reaches every worker on `:8765`, so the credential split that appears to pin the laptop in place is about SSH, and gates do not need it |
| [capture-protocol-plan.md](./capture-protocol-plan.md) | **A–C, E MET; D's diagnosis REFUTED and the cause found in the plan above.** The root it did fix: a capture is modelled as a synchronous request and is a 12–520 s asynchronous job, so the connection sits silent for minutes and the answer exists in one socket. Four defects on no list fell out of that. Also settles, with the reasoning, why NOT WebSockets and why NOT a message bus |
| [capture-protocol-version-history.md](./capture-protocol-version-history.md) | **why each `CAPTURE_PROTOCOL_VERSION` bump happened** (2 → 16) — a DIFFERENT "protocol" from the plan above: this is the capture cache's evidence-meaning key, not the wire request/response shape. Moved out of `capture-core.mjs`'s own top-of-file comment 2026-09-06, which had grown to a 176-line changelog nobody needed at the constant's call site |
| [capture-protocol-bump-costs.md](./capture-protocol-bump-costs.md) | **which of the twelve bumps in the last 32 days were avoidable, and what each cost** — verified from the VALUE'S own git history (not from the 28 commits that merely mention the identifier), cross-checked against a local corpus count with its staleness stated per row. Feeds issue #23 |
| [determinism-plan.md](./determinism-plan.md) | **CLOSED, D1–D7 met.** The one property behind it: same page in, same evidence out, whatever order the probes ran. Written after four rules for one criterion were withdrawn in a day, all of them comparing two measurements taken in different states of the page. `reliability-plan.md` preceded it. What it could NOT anticipate is recorded at the end, and became the capture-protocol plan above |
| [reliability-plan.md](./reliability-plan.md) | the CLOSED plan (A1–A3), kept for the three refutations inside A3 — a rule that is exact on the corpus and wrong on the web, four times over |
| [**proving-a-gate.md**](./proving-a-gate.md) | **how to take a check from BELIEVED to WATCHED FAILING** — the recipe, and the measurements behind it. Nine defects in one session were all checks that could not report themselves, and none had ever been observed to fire. `gates-are-proven.test.ts` holds the count: 5 of 16 |
| [`npm run verdict:preregistered`](../packages/lab/scripts/check-preregistered-verdict.mjs) | **did the run report the statistic it PROMISED, or a number?** #22 pre-registered its falsifier — *"the verdict is whether the median moved"* — the per-arm median was never recovered, a wall-clock proxy answered the question the same way, and a hardware recommendation turned on it. Nothing noticed; a person reading the row did. A recorded gate may declare a `verdictStatistic`, and this refuses when the entry's own output does not contain it. Three outcomes, because collapsing them is the defect: ARRIVED, MISSING (refused — *"the median is missing"* and *"the median did not move"* are different findings), and PROXY DECLARED (allowed, and the caveat then travels with the number). Nothing declared is exit 2, never a pass |
| [gate-exit-codes.md](./gate-exit-codes.md) | **what a gate's non-zero exit code actually means, per script** — read from source, because the same number means usage error, no data, or INCONCLUSIVE depending which gate returned it. Names the confirmed instances of the most dangerous shape: a code meaning "I stopped observing" read as "the thing failed" |
| [publish-blocker.md](./publish-blocker.md) | **the npm trusted-publishing checklist (#72/#73)** — which steps need a human logged into npmjs.com or GitHub's org settings, and `npm run npm-token:check`, the push-triggered watchdog that answers "is the first-publish token gone" as present/gone/could-not-ask rather than guessing |
| [pipeline.md](./pipeline.md) | **the CI/CD pipeline that arms, merges and closes rows — nobody does it by hand** (#298): what each unit is and where it lives, why arming early is safe by construction under `strict=false`, the environment the scripts read and why they REFUSE rather than default when it is missing, and the three shapes the auto-arm sweep will not arm |
| [row-filing.md](./row-filing.md) | **`npm run row-file`, the filing-side twin of `row-claim`'s claim-time gate** (#735) — refuses to `gh issue create` a row missing Region, Acceptance or Open-check, so the cost of a missing section lands on the filer instead of whoever claims the row later |
| [workflow-run-liveness.md](./workflow-run-liveness.md) | **three guards prove CI is CONFIGURED; this asks whether a run actually HAPPENED (#118)** — `npm run workflow:liveness -- --sha=<commit>`, a push-triggered watchdog generalising `merge-guard.mjs` (#161) into TESTED/NOT TESTED/CANNOT TELL for any commit that has already reached `main` |

## Running the long jobs

| | when you want it |
|---|---|
| [**lab-cli.md**](./lab-cli.md) | **the complete lab and fleet command line** — every job, every parameter, every refusal and what it means. Capture, export, training, calibration and the gates all run on machines that are not yours, and there is deliberately no shell: a job is a name from a fixed catalogue |

## When something is broken

| doc | read it when |
|---|---|
| [nvda-worker-runbook.md](./nvda-worker-runbook.md) | a worker misbehaves — has the error-string → real-cause table, because **the messages are misleading**: `"NVDA not installed"` usually means a version mismatch |
| [ufffc-investigation.md](./ufffc-investigation.md) | before re-investigating a stray character in announcements — includes the seven theories that were wrong |
| [nvda-correctness-audit.md](./nvda-correctness-audit.md) | you need to know whether what we capture is what NVDA actually says |

## What the tool can and cannot claim

| doc | what it settles |
|---|---|
| **coverage.md** | **all 55 WCAG 2.2 A/AA criteria and which of four states each is in** — assessed, partial, reachable, or out of scope. Generated from the code, deliberately not committed (issue #158), so there is nothing to link — run `npm run docs:coverage` |
| [screenreader-coverage.md](./screenreader-coverage.md) | every user behaviour we drive, the field it lands in, and — the part that matters — **what we do not drive yet**. A behaviour missing from that table is a claim this project cannot make |
| [capture-probe-incidents.md](./capture-probe-incidents.md) | **the closed capture-probe diagnoses, moved out of the code** — how the browse-mode restore put the mode back, why  was false on every capture (two alphabets compared as strings), and why the 1.4.13 baseline was zero by construction. A RECORD: the call sites keep every sentence that constrains the next edit, and this keeps the narrative of how each fault was found. Same move, same reason, as  |
| [probe-side-effects.md](./probe-side-effects.md) | every probe in `capture-probes.mjs`, what it DOES beyond what it reads — caret, DOM focus, NVDA mode, the page's own content — and which later probe could observe it. §43 and the §42/`focus-reset-not-logged` interaction both lived in this absence |
| [METHODOLOGY.md](./METHODOLOGY.md) | how the numbers were produced, and why the eval figures must not be quoted as a headline |
| [glossary.md](./glossary.md) | the vocabulary — capture, probe, sweep, signal, criterion, subtype |
| [local-model.md](./local-model.md) | the trained scorer: what it is, what it abstains on, and why |

## Decisions and history

| doc | what it is |
|---|---|
| [screenreader-settings-audit.md](./screenreader-settings-audit.md) | **which NVDA settings could buy us evidence** — framed demand-side from the seven gaps, with every row marked verified or hypothesis |
| [backlog.md](./backlog.md) | **the RECORD of what was found and what it cost** — it stopped being the tracker on 2026-09-06. [GitHub Issues](https://github.com/DanBeckDev/a11y-witness/issues) and Project 2's Ready column answer "what is open" now; `known-gaps.md` and `not-working.md` hold the closed items and their lessons |
| [architecture-audit.md](./architecture-audit.md) | **FROZEN 2026-09-06 — a RECORD of an outside-in structural audit (`dba4278`, revalidated `55cb006` and `acbb0be`), not a tracker. Read it for the reasoning and the measurements; for "is X still open" go to [GitHub Issues](https://github.com/DanBeckDev/a11y-witness/issues).** It was updated three times trying to stay current and went stale within the hour more than once — the same reason `known-gaps.md`/`not-working.md` below are records rather than trackers |
| [provisioning-parity.md](./provisioning-parity.md) | **does the Ansible role provision the same worker the PowerShell script does, and is parity still the goal?** Measured concern-by-concern; the role is ahead on everything that changes what a capture observes, and the decision is that parity is no longer the goal for the fleet — the script's remaining audience is a solo contributor's local worker |
| [wcag-criterion-audit.md](./wcag-criterion-audit.md) | **every claim-bearing criterion checked against W3C's own text**, using the [`wcag-criterion-check`](../.claude/skills/wcag-criterion-check/SKILL.md) procedure — the record of what was read, what was wrong, and what changed as a result. Findings land here first; `docs/backlog.md` links back to this file rather than restating them |
| [adr/](./adr/README.md) | 36 architecture decision records, indexed — the *why*, including the alternatives that were rejected and what would falsify each |
| [capture-phase-breakdown-audit.md](./capture-phase-breakdown-audit.md) | **checked the "3.9x" (12.4 s documented vs ~48.7 s measured) against what is actually on disk** — the ratio compares two different populations, protocols and statistic types, and this laptop's local corpus contains zero protocol-16 captures, so the current-fleet half of the question cannot be answered offline at all |
| [fixture-pair-proof-audit.md](./fixture-pair-proof-audit.md) | **what a good/bad fixture pair actually proves, criterion by criterion** — checked whether "the good half produces no finding" is sufficient on its own (it is not: a BLIND good half satisfies it trivially) and what closes the gap |
| [ready-label-mechanism-scoping.md](./ready-label-mechanism-scoping.md) | **can `ready` be made a claim about the present rather than a memory?** — measured what the Acceptance field actually holds across all 52 open rows, and found the constraint that decides it: a tool can extract the command but not the VERDICT, which lives in a trailing comment on a third of them. Four options with what each really costs; scoping only, the decision is the chief executive's |
| [stale-row-audit.md](./stale-row-audit.md) | **why a tracker row goes stale** — eight open rows re-checked by RUNNING their own `Open-check`, four distinct shapes, and the finding that three publish-blockers share one root cause no row names. Only one of the nine is `not-working.md` §26's mechanism-rot; the rest are a premise verified once at filing and never asked again |
| [isolation-spike.md](./isolation-spike.md) | the experiment that shaped the package split, run before anything was moved |
| [history-2026-08.md](./history-2026-08.md) | what happened, month by month, for context a diff cannot give |

## A note on how these are written

Most tables here are **measured**, and the ones that are not say so. Where a document records a mistake, it
records the wrong theories too, so nobody pays to rediscover them. If you find a claim without a
measurement behind it, that is a bug — please report it.
