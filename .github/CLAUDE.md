## You may be sharing this checkout

More than one agent works in this repo, on the same branch, at the same time. A commit of mine
once swept up 19 files, 16 of them another agent's half-finished work, and pushed it.

- **Commit explicit paths.** `git add -A` cannot tell your edits from someone else's.
- A **pre-commit hook** (`scripts/git-hooks/pre-commit`, wired via `core.hooksPath`) refuses a
  commit containing files nobody has touched recently, or too many at once, and
  names the offenders with their ages. In a shared tree, an 8-hour-old staged file is someone
  else's work.
- If the block is a false positive — long debugging session, files genuinely yours — check
  `git diff --cached` first, then `A11Y_COMMIT_ALL=1 git commit ...`.
- To commit **part** of a file another agent is also editing, stage just your hunk:
  `git apply --cached your.patch`, then `git commit` with **no path arguments** (a path argument
  makes git commit the working tree, not your staged hunk).
- `git status` before you start. Files already modified are not yours to commit.

**THE PRIMARY CHECKOUT IS READ-ONLY EXCEPT FAST-FORWARD** — two hooks enforce it mechanically; `npm run primary:update` is the only sanctioned way to move it, and **ceo or orchestrator move the primary, always and only to `origin/main` through that command** — never to a branch or a stale sha, and engineers never (ceo's ruling 2026-09-14, #912 5663195911: the orchestrator's deploy and rehearsal-check read-backs already moved it four times in one hour, every time to `origin/main`, so the rule now says what the practice is). [Why →](docs/operational-lessons.md#the-primary-checkout-is-read-only-except-fast-forward)

Multiple peer sessions can be driven by one orchestrator if each unit's acceptance is a named command and work is partitioned by RESOURCE, not topic. [What worked →](docs/operational-lessons.md#and-more-than-one-agent-may-be-driven-by-another-what-worked-measured-2026-09-05)

The browser is EVIDENCE, not configuration — `environmentKey()` keys the cache on it, Edge's preset must stay byte-identical, and nothing falls back silently. See `docs/adr/0035-the-browser-preset-is-evidence-not-configuration.md` for the decision, [the mechanism](docs/nvda-behavior-incidents.md#which-browser-a-capture-drives) for detail.
## Verifying changes

**Two of these now run themselves. That is deliberate, and it is the point.**

```bash
git push                      # pre-push hook: lint (changed), typecheck, leak scan (~10s)
npm run release:gate          # migration -> shortcuts -> signals -> rules -> held-out acceptance -> judge quality
npm run capture:check -- --worker=http://192.168.64.4:8765    # the capture layer, ~2 min
```

**Two audits added 2026-08-24 that no gate chain runs for you, and both answer questions the corpus cannot:**

```bash
npm run corpus:starvation        # word-sense MONOPOLY: a feature no conformant record carries
npm run scorer:size-sensitivity  # does a conformant page FAIL when padded with conformant content?
```

And the measurement that matters most is not in any of them: `calibrate-abstention.mjs` on the lab scores REAL pages through the product path. Watch its ASSERTED-WRONGLY column, not `referred` — collapsing the two once made the number meaningless for a day.

**Run the clean-code review on your own diff before you push** — the judgement half (does the function do one thing, is a caught error genuinely handled), which cannot live in the pre-push hook next to lint and `tsc`. Review before pushing, not after.

**Automate a check or lose it** — eight verifications existed and only two ran themselves; every manual one eventually went unrun for months. [Record →](docs/operational-lessons.md#eight-verifications-and-only-two-were-automatic)

The pre-push hook is a COURTESY; CI is the gate (#911). Three checks, ~10s: lint (changed paths), typecheck, **the leak scan** — the one CI cannot cover, since a push here is public at once. [Full scope →](docs/operational-lessons.md#the-pre-push-hooks-scope-verbatim)

Verification is layered; pick the layers your change touches:
- `npm run lint` and `npm run typecheck` — must pass. **CI gates on both**, and on `npm test`
  (`.github/workflows/ci.yml`).
**Run `npm test`, never `npx tsx --test <file>` directly, when you have changed another package's source** — cross-package imports resolve to `dist`, and only `npm test`'s `pretest` build keeps that honest.

"Resolves to `dist`" does not say WHOSE — a symlinked worktree can silently resolve to the PRIMARY's `dist`. Verify WHOSE by resolving the exact specifier: `node -e "console.log(require.resolve(...))"`. [Incident →](docs/operational-lessons.md#resolves-to-dist-does-not-say-whose)

**RESTORE FROM A COPY, NEVER `git checkout --`.** Mutation checking means editing a file you are about to restore, and `git checkout -- <file>` silently discards every uncommitted change in it, not just the mutation — it has destroyed a feature mid-build twice. `cp <file> /tmp/x && <mutate> && <run> && cp /tmp/x <file>` cannot do this. [Full incident →](docs/operational-lessons.md#restore-from-a-copy-never-git-checkout-------the-incidents)

The stale-`dist` defect exists in Python too via `__pycache__` — `test:python` runs `PYTHONDONTWRITEBYTECODE=1`. A mutation result is a fact AT THAT INSTANT, never licence to delete. [Incident →](docs/operational-lessons.md#the-same-stale-compile-defect-in-python)

- `npm test` — unit tests (`src/**/*.test.ts`) covering the deterministic rules, the judge layers,
  eval fitness, the capture cache, the run's accept/reject/retry decisions, and the WCAG criteria
  list. Fast and runs anywhere, so there is no reason to skip it.
  - `verify.corpus.test.ts` needs `runs/` and **skips honestly in CI**, which cannot see it —
    the same limitation `npm run eval` has. Run it locally before shipping a change to any gate.
  Most of this codebase genuinely cannot be unit-tested — capture needs real NVDA on Windows —
  but the pure functions can be, and these are them. Add to them when you touch a pure function.
- **Pre-release, not covered by CI:** `npm run eval:gate` (judge quality) and `verify.corpus.test.ts` (capture gates) — neither can run in CI. `npm run eval [-- <substring>]` needs the Python venv; do not quote its numbers as a headline (single-run, no expert baseline). [Full detail →](docs/capture-integrity-plan.md#eval-and-evalgate-what-cannot-run-in-ci)

- **`packages/nvda-worker/src/capture-core.mjs` only runs against NVDA on the Windows VM** — it has no local test.
  After changing it, deploy (above) and then:

  ```bash
  npm run capture:check -- --worker=http://192.168.64.4:8765   # ~2 min from the Mac
  ```

**Use the worker mode**, not the in-process one — it refuses while a worker is serving (NVDA is one machine-wide resource), which is why this check went unrun for a long stretch; going over HTTP loses nothing, since every assertion is a pure function of the capture RESULT. Run `bench-capture.mjs` too if you touched timing.

- **Count-based checks cannot see content rot — assert what was heard, not how much.** A readiness gate once deleted the h1 announcement from 90 captures with every check green, because the phrase COUNT never moved. [Incident →](docs/capture-integrity-plan.md#count-based-checks-cannot-see-content-rot)

- `npm run identity:rate -- --worker=<url> [--rounds=20]` — does a capture ever read the wrong page? Reports wrong-page, silent and unrecognised separately. [Detail →](docs/capture-integrity-plan.md#npm-run-identityrate)

`npm run evidence:check <worker>` — after ANY capture-pipeline change, asks whether the evidence moved, not the timing. Exit 0 = ship, 1 = evidence CHANGED (bump `CAPTURE_PROTOCOL_VERSION`), 2 = INCONCLUSIVE (includes partial coverage, not only zero compared). [The false-clean it once produced →](docs/capture-integrity-plan.md#evidencecheck-2-of-48-and-the-examinednothing-guard)

- `npm run training:check-signals` — proves every dataset `badSignal` fires on the bad page and stays silent on the good one. **Worker broken?** `docs/nvda-worker-runbook.md` has the error-string → cause table. **No worker to hand?** Build one: `docs/getting-started.md` (~1.5–2 h). [Full detail →](docs/capture-integrity-plan.md#trainingcheck-signals-and-worker-troubleshooting-pointers)
