# Contributing

Thanks for looking. This is a small project with an unusual constraint — **most of it cannot be tested
without a Windows machine running a real screen reader** — so the contribution paths differ a lot depending
on what you want to change. Read the section that matches.

## The 60-second orientation

| you want to change | needs a worker? | how you verify |
|---|---|---|
| the deterministic rules, the judge, the CLI report | no | `npm test` |
| a WCAG criterion's boundary, coverage claims | no | `npm test`, then `npm run rules:gate` |
| the capture pipeline (`packages/nvda-worker/`) | **yes** | `npm run capture:check -- --worker=<url>` |
| the training corpus (`packages/lab/src/training/`) | **yes**, for the recapture | `npm run training:check-signals` |
| the trained scorer | no worker, but the Python venv | `npm run eval` |
| docs, ADRs | no | read them back |

```bash
npm install
npm test          # ~1,900 unit tests, no worker, no network
npm run lint
npm run typecheck
```

If those three pass you can open a PR for anything in the top two rows.

## No Windows machine? You can still contribute

Most of the repo is plain TypeScript with no screen reader in sight: the deterministic rules, the judge
layers, the WCAG criteria list, the report, the capture cache, the run's accept/reject/retry decisions.
All of it is unit-tested and runs anywhere.

What you cannot do locally is change `capture-core.mjs`, because it only runs against NVDA on Windows. CI
has a Windows runner (`.github/workflows/capture-regression.yml`) — a ~10-minute loop, which should be the
fallback rather than the habit. `docs/getting-started.md` builds a local worker VM in about 1.5–2 hours,
almost all of it downloading Windows.

## The house rules, and why each exists

These are not style preferences. Each one is here because its absence cost something measurable, and the
incident is recorded next to the rule in `CLAUDE.md`.

**A check must never reject evidence whose absence is the finding.** Some pages fail *by announcing
nothing*. A guard that treats an empty probe result as malfunction throws away the evidence — it failed 44
cases in a live run once. Whether an empty field is a fault or a finding depends on the case definition,
which is why gating belongs in `check-signals` and not in the capture layer.

**Count-based checks cannot see content rot.** Assert what was heard, not how much. A readiness gate once
overwrote the first line of every page with the document title, deleting the `heading, level 1` announcement
from 90 captures — and every check stayed green, because the phrase *count* had not moved.

**A caught-and-logged error is not a handled error.** If nothing asserts on the log, the log is a comment.
604 captures once carried a logged probe crash that nothing read.

**A guard must be shown to fail before it is trusted.** Introduce the fault, watch your test go red, then
fix it. Two guards in this repo passed against a corpus that contained the exact defect they were written
for. Mutation-check anything that gates.

**Never swallow an error** with an empty `catch {}` — record a diagnostic or rethrow with `{ cause }`. ESLint
enforces this; the project's whole diagnostics model exists because a silent catch hid an outage.

**Comments explain *why*.** Intent, consequences, non-obvious domain facts — NVDA quirks, WCAG rationale, the
reason a number is what it is. Keep those; delete only comments that restate the code.

**Prefer a measurement to an argument.** Almost every table in this repo's docs is measured, and the ones
that are not say so. If you change a number, say where the new one came from and what the machine was doing.

## Code conventions

The applicable subset of *Clean Code*, split by what a machine can check.

Mechanical, enforced by `npm run lint` and blocking:
`max-lines-per-function` 70, `complexity` 15, `max-depth` 3, `max-params` 4, `no-empty`, and no boolean flag
arguments — bundle cohesive arguments into an object. `no-magic-numbers` is a non-blocking warning: name a
number when it is not self-explanatory.

By hand, because no linter can see them: does the function really do one thing; does the name reveal intent;
is a caught error genuinely handled. **Do not import the book's Java-OO machinery** — this is a small
functional TS/MJS pipeline, and class-per-noun here is over-engineering.

ESM throughout. `.ts` for the control plane, `.mjs` for the capture worker, which runs under plain Node on
the VM. For `.mjs`, `node -e "import('./path.mjs')"` is the only real import check — neither ESLint nor
`tsc` catches a `ReferenceError` at module load.

## Commits and PRs

**Commit explicit paths, never `git add -A`.** More than one person — and more than one agent — may be
working in the same checkout. A pre-commit hook refuses a commit containing files nobody has touched in 30
minutes, or more than 12 files at once, and names the offenders with their ages. If it is a false positive,
check `git diff --cached` first, then `A11Y_COMMIT_ALL=1 git commit`.

A **pre-push hook** runs lint, typecheck, tests, `check-signals` and `rules:gate` in about 5 seconds. It
skips the corpus-dependent checks *loudly* when `runs/` is absent rather than passing quietly.
`A11Y_SKIP_VERIFY=1 git push` overrides it and says so.

Commit messages here are longer than most projects'. They carry the measurement and the reasoning, because
the git log is where the "why" survives after the diff stops being interesting. Match the surrounding style.

## Two things that will surprise you

**Captures are cached, and the cache key is load-bearing.** It covers the page, the options, NVDA and browser
versions, the Windows build, the provisioning revision and `CAPTURE_PROTOCOL_VERSION`. Bump
`CAPTURE_PROTOCOL_VERSION` when a change alters what the evidence *means* — it forces a full recapture of
2,000+ captures, which is the point. Do not reach for it on a refactor.

**A fix applied at one call site is this repo's most expensive recurring shape.** Three of the worst defects
recorded in `CLAUDE.md` are a correct, commented remedy that reached only one of the several paths needing
it. When you find a screen-reader behaviour worth a comment, grep every path that can reach it.

## Where things live

See [the repository map](./README.md#repository-map) in the README, and `packages/README.md` for the
package split and the licence of each.

## Licence

Contributions are accepted under the licence of the package you are changing — AGPL-3.0-or-later for most,
Apache-2.0 for `packages/evidence`. See `LICENSE` and `docs/adr/0006-naming-registry-and-licensing.md`.
