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

## What a stranded PR looks like

The sweep refuses three shapes and prints the reason for each, because a queue-drainer that silently skips
is one reporting success having drained nothing:

- **`blocked`** — a person refused it, and a green `gate` does not answer that.
- **a `session:*` label** — somebody is inside it; on a PR that label IS the hold (#266).
- **no check runs at all** — nothing has ever tested it. Push to the branch to trigger `ci.yml`. This is
  STRANDED, not slow, and it reads as CLEAN to anything asking `mergeStateStatus`, which is why
  `merge-guard.mjs` asks the check runs instead.
