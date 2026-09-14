# CLAUDE.md — a11y-witness

Guidance for Claude Code (and humans) working in this repo.

## Where else to look

**THE POPULATION-SPECIFIC RULES MOVED INTO NESTED `CLAUDE.md` FILES (#1240).** Claude Code loads the
`CLAUDE.md` for the directory you are working in, so a session in `packages/nvda-worker` gets the worker
rules and a session elsewhere does not pay for them. Root was 40,296 bytes in every session.

| | |
|---|---|
| [`packages/control/CLAUDE.md`](packages/control/CLAUDE.md) | the fleet: `fleet:deploy`, `fleet:provision`, Ansible, the lab jobs, and why `worker:deploy` cannot reach a bare-metal box |
| [`packages/nvda-worker/CLAUDE.md`](packages/nvda-worker/CLAUDE.md) | the worker and NVDA: `doctor`, readiness, the capture cache, what the screen reader drives, housekeeping, environment facts |
| [`packages/lab/CLAUDE.md`](packages/lab/CLAUDE.md) | the corpus: `gate:stability`, and the ruling on who may report a gate that reads `runs/` |
| [`.github/CLAUDE.md`](.github/CLAUDE.md) | verifying changes, the hooks, and sharing this checkout with other agents |

**Nothing was reworded in the move** — every line is byte-identical, and `content-preservation.test.ts`
names these four paths as destinations rather than globbing the tree.


This file is for working ON the repo: rules only, each linking to the incident that produced it in
`docs/` (#458 split this file down from 228k chars; see `docs/operational-lessons.md` and its siblings).
Three shorter documents came first for a reason, and they are not duplicated here:

| | |
|---|---|
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | the 60-second orientation, and the question that decides everything: **does your change need a Windows worker?** Most of the repo does not. |
| [`SECURITY.md`](SECURITY.md) | what this tool does that somebody must know before running it — `probeForms` presses buttons, the worker has no authentication, `A11Y_PYTHON` is executable |
| [`docs/README.md`](docs/README.md) | the index to every guide and runbook, grouped by task, with [`docs/adr/README.md`](docs/adr/README.md) for the decision records |
| [`docs/backlog.md`](docs/backlog.md) | **The RECORD of what was found and what it cost.** [GitHub Issues](https://github.com/DanBeckDev/a11y-witness/issues) answers "what is open" — `ready` is pickable, `in-progress` plus a `session:` label is claimed. This file, `known-gaps.md` and `not-working.md` hold the measurement, the wrong turn and the command that settles it: the half an issue is bad at |
| [`docs/known-gaps.md`](docs/known-gaps.md) | **what this project does NOT do, or does not yet know** — each with what it would cost and what would tell you it is fixed. Read it before claiming a thing is finished; "all gates pass" and "everything is validated" are different claims |
## What this is

a11y-witness drives a **real screen reader (NVDA)** through real navigation to assess the lived
assistive-technology experience: the WCAG failures that rule scanners structurally cannot reach. It sits
**alongside** axe-core (the rule/visual layer), not instead of it. See `README.md`, `PLAN.md`, `docs/adr/`.

**A finding is either ASSERTED or REFERRED, and knowing which is decided by which layer owns the subtype.**
This paragraph used to say the trained scorer "assesses the judgment-based WCAG failures" — it does not
assess them in the sense of concluding anything. The product-path real-page figure is under re-measurement since
2026-09-14 (#1579): the last one published, 2026-08-24 on 18 conformant real pages, read
**0 criteria asserted wrongly, 4 referred.** README's claim block carries the current statement.

| | |
|---|---|
| **rules** (`rule-ownership.json` → `decidedBy: "rules"`) | the only layer that MAY assert — but only 4 of the 18 rules-owned subtypes actually assert (`1.1.1:missing-alt`, `1.1.1:filename-alt`, `4.1.2:unnamed-control`, `4.1.2:state-change-silent`); the other fourteen map as `secondary`/`cantTell` because they INFER where the four READ directly. `asserting-subtypes.test.ts` pins both numbers against the artefacts — this count has drifted three times as subtypes were added. [Drift history →](docs/operational-lessons.md#the-asserting-subtypes-count-has-drifted-three-times) Exact on every criterion it owns, 0 false positives across 1,183 conformant records. |
| **the trained scorer** (`judge-backend: local`, no rented LLM) | `findingsFromScores` sets NO `mapping`, and `RequirementMapping` defines absent as `secondary` — so every model finding becomes `cantTell`. It TRIAGES: finds the moment worth a human's attention and quotes the announcement. |

ADR 0021 records why that is the right division rather than a shortfall, and moved
`4.1.2:state-change-silent` — the flagship finding — from the model to the rules so it could be stated
rather than suggested.
## Code conventions

We follow the applicable subset of *Clean Code* (Martin). It has two halves, enforced differently.

**Mechanical — enforced by ESLint (`npm run lint`); errors block CI:**
- Small functions that do one thing at a single level of abstraction; the top-level function reads as a top-down narrative (the Stepdown Rule). Gated by `max-lines-per-function` (70), `complexity` (15), `max-depth` (3).
- Few arguments, and **no boolean flag arguments** — bundle cohesive arguments into an object instead. Gated by `max-params` (4).
- **Never swallow an error** with an empty `catch {}` — record a diagnostic or rethrow with `{ cause }`. Gated by `no-empty`. (This codebase's whole diagnostics model exists because silent catches once hid an outage.)
- `no-magic-numbers` is a non-blocking **warning**: name a number when it is not self-explanatory (timeouts, budgets, limits); HTTP status codes and slice lengths are fine inline. This matches the book's G25 ("only when the value is not already self-explanatory").

**Judgment — not machine-checkable, so honor these by hand:**
- Does the function *really* do one thing? Extracting a helper whose name merely restates its code is not progress (the book's own test).
- Comments explain **why** — intent, consequences, non-obvious domain facts (NVDA quirks, the cursor-at-end gotcha, WCAG rationale). **Keep those.** Delete only comments that restate what the code already says. The book attacks noise and bad-code-compensating comments, and explicitly endorses intent/warning comments.
- Intention-revealing names; rename freely when a better name appears.
- **Do NOT import the book's Java-OO machinery** (Abstract Factory to hide switches, class-per-noun, ArgumentMarshaler-style hierarchies). This is a small functional TS/MJS pipeline; adding class structure here is over-engineering, the opposite of "scalable." Match the surrounding functional style.
