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

**This is `acceptance`-specific, deliberately.** `reusable-build-test.yml`'s `ts` and `trunkGate`
invocations never read `jobCapabilities` — and unlike `acceptance`, both genuinely carry a real
`GH_TOKEN: github.token`, which is why `row-claim-live.test.ts`'s live call passes there. `fleet` is a
runner-level fact true of every job here; `token` is not — it is `acceptance`'s own deliberate no-token
choice (this is the one job that executes an untrusted PR body's own commands), so a future caller of this
same mechanism from `ts`/`trunkGate` would need its own, differently-true `token` value, never this one.

**A bare `History: full` line in the PR body** (its own line, nothing else) asks the job to deepen its
checkout before running Acceptance/Refutation commands. `reusable-acceptance.yml` (this job's actual steps,
since #452 split it out of `ci.yml`) reads the identical `hasFullHistoryDeclaration` function
`acceptance-commands.mjs` itself uses — never a second, hand-written copy of the regex in YAML — and runs
`git fetch --unshallow origin main` when it is present, after `npm ci`/`npm run build` and before the
command actually runs. With it declared, a `// requires: history` test runs for real, in `acceptance`, on
this job's own token; without it, the command is refused and named.

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

## `mergeSafety` also checks what you DECLARED against what GitHub RESOLVED (#549)

A PR body can carry `Closes: none — <reason>` and still close two other issues, because GitHub's own
closing-keyword scan (`close(s/d)`, `fix(es/ed)`, `resolve(s/d)` immediately followed by `#N`) runs over
the WHOLE body, not just a `Closes:` line — and it fires on an explanation exactly as readily as a real
declaration. Measured the same day, twice: a PR that said, mid-sentence, *"the wiring PR (#530) closes
#494"* closed #494 while declaring `none`; a PR that said *"whose acceptance now says it \`closes #492\`"*
closed #492 the same way. Both had to be reopened by hand.

**`scripts/closes-mismatch-check.mjs` compares two facts this pipeline already holds**, rather than
trusting either alone: what the body DECLARED (`extractClosesDeclaration`, B7's own gate, already run in
`acceptance`) against what GitHub actually RESOLVES (`lookupClosingIssues`, the same
`closingIssuesReferences` query `close-rows-for-merged-pr.mjs` already relies on). Neither is new work —
the check is one comparison.

**It runs as a new step in `mergeSafety`, never inside `merge-guard.mjs --ci-gate`'s own composition.**
Two reasons: `mergeSafetyVerdict` is deliberately scoped to head-vs-tip ONLY, because its sibling rules
(ancestry, closing-claim) were measured refusing the NORMAL case when asked unconditionally in CI — see
that function's own header — and this check has the opposite property (silent on every well-formed PR),
so folding it in would blur a boundary that exists for a real reason. And it needs the same
`closingIssuesReferences` GraphQL query and `GH_TOKEN` `merge-guard`'s lookups already use, which the
`acceptance` job structurally cannot have (see above — it runs an untrusted PR body's own commands).

**Refused in both directions, because they are different faults**: a number GitHub resolves that the body
never declared is an accidental closure (both incidents above); a number the body declares that GitHub
never resolves is the `Closes A1c (#487)` shape from the same morning — a well-intentioned declaration
GitHub's own matcher never picked up, so the row silently stayed open. The refusal names the actual line
and phrase (`findClosingPhrase`), not just the number, so an author goes to the sentence rather than
re-reading the whole body.

**Skipped, not refused, when the declaration itself is `missing`/`malformed`** — `closesDeclarationReport`
(the `acceptance` job's own gate) already refuses those; this check would only be a second, independently
drifting opinion about the identical fact.

**`npm run mutate` and `Refutation:` have OPPOSITE exit conventions (#516).** `mutate`'s own contract is
exit 0 = the guard bites — the good outcome. `Refutation:` reads success as any non-zero exit (#438), so
naming `mutate` on a `Refutation:` line inverts the verdict, and the dangerous half is silent: a guard that
did **not** bite exits 1, which `Refutation:` reads as *refused* — the passing state. It produces a green
for the exact case the section exists to catch. `classifyCommand` now refuses this at parse time rather
than misreading it — paste `mutate`'s real output under an unparsed heading instead, the way #504 already
does, or move the line to `Acceptance:` if exit-0-is-good is genuinely what you mean.

## "I will hold it open" is not a state the pipeline offers — a draft is

A PR that must not merge until something outside CI happens is opened as a **draft**, and its body names what un-drafts it. Nobody disarms, and nobody asks anyone to wait.

**This was learned by the pipeline overriding a considered decision, 2026-09-08.** #530 wired the consumer gate, and its author said they would hold it open until a third `windows-2022` dispatch went green — the acceptance `ceo` had set for #494. **It merged 18:49:35Z anyway**, armed and green, and closed #494 two seconds later, with the acceptance unmet and only two dispatches on record, both red.

**Nobody did anything wrong.** `auto-arm` armed it on `opened`, `gate` went green, GitHub completed the merge. The pipeline did exactly what this page's first line says it does — and an author's intention is not a thing it can see.

**So there is no "hold" to ask for.** The two states that actually prevent a merge are:

| | |
|---|---|
| **draft** | `auto-arm.yml:73` refuses a draft outright — `gh pr merge --auto` is "not allowed for draft PRs". This is the sanctioned hold, and it is the same mechanism used to run CI against a branch without racing anything |
| disarm | contradicts *the pipeline decides; nobody arms or merges by hand*. **Not available** |

**The body must say what un-drafts it**, because a draft with no stated condition is indistinguishable from one somebody forgot. `Closes: none — <reason>` carries the same rule for the same reason: *"nobody wrote one"* and *"this deliberately has none"* must never read the same.

**The pipeline still decides everything it can see.** A draft is not a veto over the queue; it is an author declaring that the evidence this PR closes on does not exist yet. Once it does, un-draft and the pipeline takes it from there.

### The corollary: what closes a row is not what proves it

#494's deliverable merged and the row closed correctly; its **proof** — the third Windows dispatch green through `verify-report` — lives on #492, and #492's acceptance says so. **A closed row whose acceptance is unmet must say where the acceptance went**, or the closure gets read as the proof by the next person.

## Waiting on a PR's checks: scope to the SHA and the workflow, and require a COMPLETED run

**`gh pr checks` polled for "zero pending" reports a PR settled in the gap before GitHub has created
any check runs.** Measured 2026-09-08 on #532: thirteen seconds after a push, the waiter reported
three passing checks and exited. They were `auto-arm`'s — `arm`, `stalled`, `sweep` — and `ci` had
not started. *Everything finished* and *nothing started* both satisfy "no pending", and they need
opposite responses.

This is CLAUDE.md's own systemd rule — **exit on a positive verdict, never on the absence of a
marker** — reaching a source it had not been applied to. The same misread produced #401's
`armed "ten seconds after open"` the same morning.

```bash
SHA=$(git rev-parse origin/<branch>)
R=$(gh run list -c "$SHA" -w ci --limit 5 --json status,conclusion,databaseId)
LIVE=$(echo "$R" | jq '[.[]|select(.conclusion!="cancelled")]')
# settled when: length > 0, and every remaining status == "completed"
```

Four things, and each one has been wrong here:

- **Scope to the head SHA**, not to the branch or the PR number. A branch-scoped query answers with
  a run against the commit the sweep has since replaced.
- **Name the workflow.** `ci` is the one that gates; `auto-arm` answers seconds after any push and
  will happily satisfy a loose condition on its own.
- **Drop `cancelled` runs.** `ci.yml`'s concurrency group is `ci-${{ github.ref }}` with
  `cancel-in-progress: true`, so two events in quick succession — a `synchronize` and an `edited`,
  which is what a push plus a body fix produces — leave a cancelled run beside the live one. A
  cancelled run is not a verdict, and `statusCheckRollup` unions it into the rollup anyway (#500).
- **Require at least one COMPLETED run.** `length > 0` is the half that stops an empty result — no
  runs created yet — from reading as "all of them finished".

And give the loop a second exit: the PR may be **merged** out from under it, which is a terminal
state the run list will never report.

## An Acceptance block is EXECUTED, so it holds commands and nothing else

The `acceptance` job runs every line of a PR body's Acceptance section as a command
(`scripts/acceptance-commands.mjs`). That is the whole point of #353 — nothing had ever run a row's
acceptance, and every one was an author's prose report of a result nobody re-derived. It also means the
section is an argv list wearing prose's clothes, and two shapes that read perfectly well to a person are
executed as nonsense.

Both of these cost a red run on #581 on 2026-09-09, and both look like a failing test rather than a
malformed body:

```
actionlint .github/workflows/ready-label-audit.yml          clean
  -> ACCEPTANCE: "actionlint ... clean" is not a command (no executable "actionlint")

npx tsx --test .../ready-label-audit-triggers.test.ts       8/8 (was 7, one inverted, one added)
  -> ACCEPTANCE: RAN ... -> fail (matched no file: .../ready-label-audit-triggers.test.ts, 8/8, (was, 7,, ...)
```

The first is a command the runner does not have — `actionlint` is not installed on the runner, so a line
naming it can only ever be reported as a missing executable. The second is worse, because it *ran*: the
trailing result was swallowed into the argv, the glob then matched no file, and a test suite that passes
locally reported a failure whose message is about file matching.

So:

- **Commands only, one per line.** Put the result — `8/8`, `43/43`, `clean` — in prose OUTSIDE the block.
- **Only commands the runner can execute.** Anything needing a tool CI does not install (`actionlint`), a
  worker, the corpus, or the Python venv goes in prose with a sentence saying who runs it and where. A
  `runs/`-reading gate is already forbidden from an acceptance block by CLAUDE.md's own ruling for the
  same reason one layer along.
- **The three outcomes must stay three.** `MISSING`, `REFUSED` and a `RAN -> fail` are different states;
  a body with no Acceptance section at all reports `ACCEPTANCE: MISSING` and exits 1, which reads like a
  failing check and is really an unwritten one.

The general form is this repository's oldest shape: a field that is DATA to one reader and an
INSTRUCTION to another. It is the same defect as text that reads as documentation and parses as a closer
(#549), and as a scanner matching prose about the scanner — eight instances of that on 2026-09-08 alone.
Ask what will EXECUTE what you are writing, not only what will read it.

### The parser is the authority on the body, and it is one command

Every one of those failures was found by CI and could have been found in ten seconds. A PR body is read
by three separate parsers before anything else looks at it — the acceptance runner, the `Closes:`
resolver, and `owned-path-signoff` — and each is importable and drivable against a file.

Run them against your own body before pushing. Measured on 2026-09-09: three PRs failed
`CLOSES: MISSING` in one morning, and one failed `ownedPaths` on a body that stated the fact perfectly
well thirty lines below a sentence that merely mentioned it. All four were bodies, none were code, and
each cost a full CI cycle to discover.

```
node -e "import('./scripts/acceptance-commands.mjs').then(...)"   # what the runner will execute
node scripts/owned-path-signoff.mjs --diff=<file> --body=<file>   # exit 0, or what it wants stated
```

**A cheap pre-check is for deciding whether to bother running the real one, never for concluding the
real one will pass** — CLAUDE.md's own rule. This is the inverse case and the rule still holds: here the
cheap check IS the same code CI runs, so it is not a proxy at all.

### Before naming a failing check, read what its JOB can do

The `acceptance` job is **shallow, tokenless, and cannot build the board document**. It checks out at
depth 1, carries `permissions: contents: read` and no `GH_TOKEN`, and runs whatever the PR body's
Acceptance block says to run. So a body whose acceptance is `npx tsx --test .../*board*.test.ts` produces
a list of failing board-style assertions **in that job and nowhere else** — the tests are fine, the job
cannot assemble the document they read.

Measured 2026-09-09 on #564: six assertions reported failing there, while `board-style` passed in the
`docs` job and locally at 923 words of 925. The real reds were four different guards in the `docs` job —
a LAN address, guest and control-plane paths, and rename literals in the record. **The same artefact has
now misled three sessions in two days**, each of whom read the failure list and reported it as the PR's
own.

This is the diagnostics table's shape one layer out: not a wrong value, but a correct value read without
asking what produced it. Before quoting a failing check, ask what that JOB is able to do — its checkout
depth, its token, its permissions — the same way you would ask what window a journal was bounded to.

### Reading a dependency's source answers the question you asked, not the one next to it

`worker-judge`, 2026-09-09, on their own fix and unprompted:

> Reading a dependency's source correctly answers *"does this pattern get REJECTED"*. It does not
> separately answer *"does this pattern MATCH ANYTHING"*.

#568's first fix passed the rejection question and failed the matching one: `github.action_path` on
`windows-2022` is a **backslash** path, and `@actions/glob`'s `Path` splits on the OS's own `path.sep`,
so a concatenated `/package-lock.json` was swallowed into the final segment's literal filename and
matched nothing on disk. The error read `Some specified paths were not resolved`, which sounds like a
missing file rather than a malformed pattern.

This is the same shape as three of the most expensive defects in this repository — `evidence:check`
comparing objects through `String(entry)` so every entry was identical; `refreshBrowseBuffer` guarded on
a flag nothing ever set; the signal-type scrape that matched nothing and asserted over an empty set.
Every one was verified in the direction where it could not fail. **Ask which half of your question the
check you just ran actually answered.**

## A fix and its correction travel together, or the window between them is live

Twice on 2026-09-09 a change reached `main` without the correction that makes it correct.

- #575 gave `decideRevert` a working credential; #582 fixed it reading only `trunkGate` while its trigger
  fires on `trunkBuildTest` too. In the wrong order, the credential arms a wrong verdict — the revert PR
  opens against an innocent merge, auto-armed and gate-green, and it merges. Caught by ordering them.
- #593 merged the lane check; the two commits adding its generated-file exception were pushed to the
  branch *after* the merge was cut, so the guard went live **without** the exception and refused a PR it
  was never meant to refuse. Caught by measuring it against that PR's real branch name and path.

So: **when a fix has a correction, the correction merges first or in the same commit range, never
after.** A derived artefact and its qualifier are false in the window between — this repository has paid
for that four times in one release — and here the window had a live guard in it.

## A lane is who may CHANGE a path

`scripts/workflow-lane-check.mjs`, a step in `mergeSafety`, refuses a PR that changes a lane-owned path
from a branch outside that lane. Today there is one lane: `.github/workflows/` belongs to `dispatcher`.

The reason is measured. On 2026-09-08 a `pull_request: [closed]` trigger was added to
`ready-label-audit.yml` from outside the pipeline's lane. The change was reasoned and the reasoning was
sound; the consequence was that the audit's verdict attached to every merged PR's head commit as a check
named `audit`, and it failed on a board call whose PAT cannot read Projects v2. Seven merged PRs carried
a red mark for ninety minutes, and the chairman found it before the org did.

**Nobody was careless. The cost of that change is visible from the merge queue and from nowhere else.**
A boundary that can only be seen from one seat is not enforced by asking people to remember it.

**A lane is not a wall.** Crossings are assigned deliberately — the very change above was `ceo`'s own
assignment, to a session that asked first — so the check accepts an exception and RECORDS it:

```
Lane-exception: the pipeline -- assigned by ceo -- <why, in the assigner's words>
```

All three parts are required, and the line is echoed into the run log rather than merely accepted. A
line naming the lane with no reason is refused: this repository has already measured what an agreement
existing only as a sentence is worth (#197 — three double-dispatches, each caught by a worker's caution
and never by the tool).

The lane list is `docs/lane-ownership.json`, which `ceo` owns. Data, so a lane moves without touching the
mechanism, and so the mechanism cannot quietly decide who owns what — the same split as
`docs/owned-path-facts.json`, which answers the DIFFERENT question of what a change to a path must
declare. A path can be lane-owned and fact-free, or fact-heavy and open to everyone; folding the two
together would make one owner's edit silently move the other's rule.
