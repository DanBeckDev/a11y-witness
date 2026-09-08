# The CI/CD pipeline

Adopted by the board via `ceo` (#298). **The pipeline decides; nobody arms or merges by hand.** A worker
owns its PR from open to merge, and the units below are what carries it there.

This page exists because the units were specified in an issue thread and their environment was documented
nowhere — which is this repository's own "a command nobody can find is a command nobody runs", applied to
the machinery that merges everything else.

## The units

| | what it does | where |
|---|---|---|
| **1** | auto-arm every non-draft PR against `main` on `opened`/`ready_for_review` | `.github/workflows/auto-arm.yml` |
| **1c** | sweep the PRs unit 1 structurally cannot see — the ones already open when it shipped | `scripts/auto-arm-sweep.mjs`, same workflow |
| **1d** | close the rows a merged PR declared, because GitHub does not do it for a bot merge | `.github/workflows/close-rows.yml`, `scripts/close-rows-for-merged-pr.mjs` |
| **2** | run the `Acceptance:`/`Mutation:` commands out of a PR body (#353) | not built |
| **3** | revert a push that fails `gate` on `main` | `trunk-guard`, `decideRevert` |
| **4** | continuous delivery to npm `next`, and fleet self-deploy | not built |

**Arming is safe by construction, and the reason is worth keeping.** `gh pr merge --auto` only ARMS; GitHub
still withholds the merge until every required status check is green for the head it has recorded. `main`
runs `strict=false`, so that head need not contain `main`'s tip — which is #195's defect — and `ci.yml`'s
`mergeSafety` job is part of the required `gate` context and refuses exactly that shape (#294).

**Unit 1d exists because `issues: write` was never the lever.** Measured 2026-09-07, after the permission
landed on `auto-arm.yml`: four of four bot merges failed to close their declared rows (#310, #321, #344),
while two of two human merges closed theirs (#326, #331). The mechanism — whether a merge under
`GITHUB_TOKEN` can close a referenced issue at all — is a **hypothesis nobody here has confirmed against
GitHub's documentation**, and unit 1d works whether or not it is true. See #298.

## The PR `ts` job runs only what a diff actually reaches (A1b, A1c)

Chairman, verbatim: *"the trunk guard is running all of the unit tests. this takes just as long as the
pr one. so we should change the pr unit tests to only run on the files changed for pr efficiency and ci
efficiency."* Measured: PR `ts` 83-155s, `trunk-guard` 144-155s — the same suite, twice, on every merge.

`scripts/select-changed-tests.mjs` narrows `ci.yml`'s `ts` job to the test files that actually reference
what changed, by three mechanisms depending on where the changed file lives:

| changed file | reference kind | fallback when zero found |
|---|---|---|
| `packages/*/src/*` | by IMPORT (transitive) | that file's own package, full suite |
| `scripts/*.mjs` | by IMPORT (the SAME reverse index) | every implicated package, full suite |
| a hook, or a workflow other than `ci.yml` | by PATH STRING, in a real quoted literal (comments stripped first) | every implicated package, full suite |
| `ci.yml` itself, or a root config (`ci-changed.mjs`'s `ROOT_TS_FILES`) | none — genuinely `BROAD` | (the whole search is skipped) |

`ci-changed.mjs`'s package-level `testPackages` (the transitive closure of dependent packages) stays the
search scope and the safety net underneath all of this — narrower than before, never wider.

**The zero-tests fallback is the point, not the narrowing.** A changed file with no reference anywhere
falls back to a named full-package run rather than silently selecting nothing — this is the job that
gates every PR, and a check that passes having run nothing is this repository's most-recorded defect.

**The path-string search must not match a mere mention in prose.** A doc comment discussing
`` `scripts/foo.mjs` `` in this repo's own markdown convention is not a quoted JS string literal, so
comments are stripped (`@a11ign/evidence/source-text`'s `stripComments`) before the search runs — a test
that DISCUSSES a file is not a test that exercises it.

## The environment these scripts read

### `GITHUB_REPOSITORY`

`owner/name` of the repository to act on — `DanBeckDev/a11y-witness`. **GitHub Actions sets it
automatically on every runner**, so no workflow here assigns it a literal; each job passes
`${{ github.repository }}` through, which is the same value by a route that cannot drift from the repo the
job is actually running in.

Read by `scripts/auto-arm-sweep.mjs` and `scripts/close-rows-for-merged-pr.mjs`.

**Both exit `2` (CANNOT_ASK) when it is unset rather than defaulting to a repo name**, and that refusal is
the point: one of them arms merges and the other closes issues, so a guessed repository would take a real
action against the wrong tree. *"Could not ask"* and *"asked and found nothing"* must never be the same
answer — the rule this repository states most often.

**Set it yourself when running either script by hand**, which is the normal way to rehearse one:

```bash
GITHUB_REPOSITORY=DanBeckDev/a11y-witness node scripts/auto-arm-sweep.mjs
```

Note that the sweep **arms real PRs** when it runs, so a rehearsal is not free. To see its decisions
without acting, drive `sweepDecision` directly — it is exported for that, and takes the labels and check-run
count rather than reaching for the API itself.

### `GH_TOKEN`

The token `gh` authenticates with. In CI every job that spawns `gh` declares
`GH_TOKEN: ${{ github.token }}`, and `gh-token-jobs.test.ts` discovers each job that can reach a `gh` spawn
— transitively, through local imports — and fails until it does. Locally, `gh auth login` covers it.

The permissions each workflow grants are deliberately narrow and are pinned by tests. `close-rows.yml` has
`issues: write`, `pull-requests: read`, `contents: read` and nothing else: **a workflow triggered by a
merged PR must never be able to push**, and `close-rows-on-merge.test.ts` goes red if `contents` is raised.

## Merging `main` into a branch now needs `npm install`, not just a build

**Since #357 landed at 21:34Z on 2026-09-07, the workspace scope is `@a11ign/*` and was `@a11y-witness/*`.**
A worktree that merges `main` in and goes straight to `npm run build` fails with roughly 35
`TS2307: Cannot find module '@a11ign/...'` across `cli`, `judge`, `worker-fleet` and `scorer`.

The cause is one step further back than the hazard this repo already records. A worktree's `node_modules`
is a symlink to the primary checkout's, and **the workspace links under it are named after the scope**.
`npm run build` recreates `dist/`; nothing recreates a symlink whose name changed. So:

```bash
npm run primary:update        # in the PRIMARY: fetch, detach at origin/main, nothing else
npm install                   # in the PRIMARY: recreates node_modules/@a11ign/*
npm run build                 # in the PRIMARY
```

Found by `worker-config` and `worker-judge` independently, within minutes, because every worktree broke at
once. That is the one mercy here: a stale INSTALL fails loudly, where the stale BUILD it resembles produces
a wrong answer quietly — `orchestrator` once read a two-hour-stale `dist` and was about to dispatch a
worker at a defect that did not exist.

**`node_modules/@a11y-witness` is still present alongside `@a11ign`**, because `npm install` adds the new
scope without removing the old. Harmless in itself, and a trap in exactly one direction: a leftover
`@a11y-witness/*` import anywhere in the tree will now RESOLVE rather than fail, so the check that would
have caught an incomplete rename is disarmed. Grep the TREE for the old scope, never `node_modules`.

**A script that runs in CI with only `actions/checkout` is immune, and that is why it imports by relative
path.** `auto-arm-sweep.mjs` and `close-rows-for-merged-pr.mjs` both reach `cli-flags` as
`../packages/worker-fleet/src/cli-flags.mjs` rather than by scope — a choice made for the bootstrap reason
(#330/#331: the package specifier resolves to a `dist/` that a checkout-only job does not have), which
turned out to make them the only things in the tree the rename could not touch.

## What a stranded PR looks like

The sweep refuses three shapes and prints the reason for each, because a queue-drainer that silently skips
is one reporting success having drained nothing:

- **`blocked`** — a person refused it, and a green `gate` does not answer that.
- **a `session:*` label** — somebody is inside it; on a PR that label IS the hold (#266).
- **no check runs at all** — nothing has ever tested it. Push to the branch to trigger `ci.yml`. This is
  STRANDED, not slow, and it reads as CLEAN to anything asking `mergeStateStatus`, which is why
  `merge-guard.mjs` asks the check runs instead.

## `update-branch` moves your branch under you — a non-fast-forward is the train, not a violation

The `update-branch` job in `.github/workflows/auto-arm.yml` runs `scripts/update-branch-sweep.mjs` on
**every push to `main`**, and it pushes to *other people's branches*: `main`'s protection runs with
`strict=false` (#277), so an armed PR merges the instant its own `gate` is green without containing
whatever landed since, and every merge therefore leaves every other open PR one commit further behind.
`queue-stalled.mjs` only ever REPORTS that drift; this job is the half that fixes it.

**So a `git push` to your own branch can be rejected as non-fast-forward while you did nothing wrong.**
The sequence is: `main` moves, the sweep merges it into your branch and pushes, and meanwhile you were
doing the identical merge locally. Two independent merge commits, usually with identical trees, and your
push is refused. Measured 2026-09-08 on #486 — the author reconciled with a merge-of-merges (no
conflicts) at `fa29ea00`, and by the time they re-verified, the sweep's push had already carried the PR
to green and it had merged. `main` moves fast enough for this to recur inside one branch's life:
`agent/commands-doc-478` carries two `Merge origin/main` commits 4m45s apart (`7e9fcc1d` 06:58:18Z,
`41567103` 07:03:03Z), with different trees, because `main` moved twice while the branch was being
prepared.

**The recovery is `git pull` and merge, never `git push --force`.** Both trees are real work: the
sweep's push is what keeps your PR mergeable under `strict=false`, and force-pushing over it silently
discards a merge the pipeline made on your behalf, putting the PR back behind `main` with a head no
check run has seen. `--force-with-lease` is not the fix either, but it is not the hazard — it REFUSES,
because the remote moved, which is the same answer a plain `push` already gave you. Merge the two, push, and let the sweep and your own
merge coexist — a duplicated merge of `main` with an identical tree costs a commit in the graph and
nothing else.

Two consequences worth knowing before they surprise you:

- **The job is `continue-on-error: true` by category, not by accident** — it is a push-to-`main` job
  acting on OTHER open PRs after a merge that already happened, so it can never gate anything, and a red
  run of it must never read as a gate failure. It is allowlisted in `push-trigger-allowlist.test.ts` as
  `TRUNK_FOLLOWUP_ALLOWLIST` for that reason (ceo's ruling, 2026-09-08).
- **With no `A11IGN_BOT_TOKEN` the job SKIPS outright and does not fall back to `GITHUB_TOKEN`.** A push
  made with `GITHUB_TOKEN` fires no `pull_request: synchronize`, so an updated branch would get a new head
  with no check run ever triggered for it and its required checks waiting forever — worse than leaving it
  visibly behind. If PRs stop being pushed up, check the secret before suspecting the sweep's decision.

## The `acceptance` job is SHALLOW and its token reads CONTENTS ONLY — name a command it can actually run

Three PRs failed `acceptance` in one morning (2026-09-08) for reasons that had nothing to do with the
change under review. In each case the author named a command that passes locally and cannot run in that
job. The job is doing its work — it refuses rather than reporting success — but nothing said what
environment it offers, so authors were discovering it one failed run at a time.

`ci.yml`'s `acceptance` job, quoted:

```yaml
  acceptance:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4          # <- NO fetch-depth. Depth 1.
```

**Depth 1, and `actions/checkout` fetches the PR ref, not the branch.** So `refs/remotes/origin/main`
**does not exist** on that runner and there is no history behind the head. Anything of the shape
`git diff origin/main...HEAD`, `git show origin/main:<path>`, `git merge-base`, or a test that reads what a
branch changed will fail with `fatal: invalid object name 'origin/main'` or `no commits in common`.

**Compare `ts`, which declares `fetch-depth: 0`.** The asymmetry is deliberate and both halves are
load-bearing: `ts` needs full history because A1b's `select-changed-tests.mjs` runs `git diff <base>...HEAD`
in that same job. So **the identical test can pass in `ts` and fail in `acceptance`**, which is exactly what
happened to A6 (#505): `ok 668` in `ts`, `not ok 3` in `acceptance`, same file, same commit.

**The token is scoped `contents: read` and nothing else.** A test that calls the GitHub API for issues,
pull requests, labels or check runs fails there. `row-claim.test.ts` carries a deliberate live smoke test —
`fetchLabels against the real #55 succeeds structurally, live` — and #504 named that whole file as its
acceptance command; every one of its own assertions passed and the live one could not.

**And no fleet, no lab, no corpus.** `runs/` is gitignored, so every corpus-reading gate skips there; the
standing resource ban applies to this job by construction rather than by policy.

### What to name instead

| you want to prove | name this |
|---|---|
| a unit test | the specific test file, or `--test-name-pattern` for your cases |
| something needing history | declare `// requires: history` in the test and `History: full` in the PR body (below) — or run it in `ts` and say so in the body instead |
| something needing the API | run it locally, paste the output, and name a non-live command here |
| a guard bites | `npm run mutate -- --file=… --mutate=… --test=…` on a file the job has |

**Say which job runs each command.** *"It passed"* and *"it passed in the one job with full history"* are
different claims, and only the second survives being read a week later.

### A test can declare what it needs, and the PR body can supply it (#510, #497)

The table row above used to be the only answer for a history-needing test: run it in `ts` instead, and say
so. That is still fine, but it means the `acceptance` job can never actually prove that specific command —
it can only refuse to run it and trust the author's word about a different job. #510 makes the refusal
itself the mechanism, and #497 gives a PR body a way to lift it when the command genuinely needs it.

**A test file declares what it needs, anywhere in the file, as its own header:**

```js
// requires: history
```

`acceptance-commands.mjs` reads this off any `.test.ts`/`.test.mjs` file a `tsx --test` Acceptance or
Refutation command names (not windowed to the first few lines — this repo's own test files, like
`pre-push-resolve-toward-main.test.ts`, commonly carry a long doc-comment header before the first `//`
line). If the job's own capabilities do not satisfy the declared requirement, the command is **REFUSED**,
named, exactly like the fleet/lab/corpus refusals above — never silently run against a guard that quietly
`t.skip()`s itself out from under a shallow checkout. `token` and `fleet` are structurally always false in
this job (the same two facts this whole page already documents); `history` is the one axis a PR controls.

**A bare `History: full` line in the PR body** (its own line, nothing else) asks the job to deepen its
checkout before running Acceptance/Refutation commands. `ci.yml` reads the identical
`hasFullHistoryDeclaration` function `acceptance-commands.mjs` itself uses — never a second, hand-written
copy of the regex in YAML — and runs `git fetch --unshallow origin main` when it is present, after
`npm ci`/`npm run build` and before the command actually runs. With it declared, a `// requires: history`
test runs for real, in `acceptance`, on this job's own token; without it, the command is refused and named.

**The declaration is deliberately cheap to get wrong in one direction only.** `History: full` with no
command that actually uses it is not an error — the job prints a `WARNING:` line and keeps its `ok:true`,
because the only cost of an unused declaration is the time the extra fetch takes. The one thing it must
never become is a flag added to turn a red check green: it has no effect on which commands are refused
or on their exit codes, only on how deep the checkout is before they run.

### Two traps inside the job itself

**`PR_BODY` is the LIVE payload; the parser is the STALE checkout.** `ci.yml` passes
`${{ github.event.pull_request.body }}`, so editing a body re-runs `acceptance` against the *new* body and
the *old* `acceptance-commands.mjs` from that PR's own checkout. A parser fix therefore does not reach any
PR opened before it merges — but a body edit does re-trigger the run, because `ci.yml` lists `edited` among
its `pull_request` types.

**A heading is a title, not a command.** `## Acceptance — some prose` had the trailing text taken as an
inline command (#506): before #446 that prose was *executed*, and a heading beginning with a real builtin
(`## Acceptance: test the new thing`) produced a green acceptance that ran nothing. The inline form is what
follows a **colon**. Fixed in #508; the general rule is worth keeping — put the explanation on its own
line, not in the heading.
