# Branches that never had a pull request

`ci.yml` triggers on `pull_request`. **A branch pushed without one gets no CI at all** — not lint, not
typecheck, not tests — and nothing in this repo could see it.

```bash
npm run branches:no-pr          # report
npm run branches:no-pr -- --json
```

Measured 2026-09-07: **132 pushed branches, 62 that no PR has ever pointed at, 9 of those still carrying
content `main` does not have.**

## Why nothing else catches it

| tool | what it asks | why it misses this |
|---|---|---|
| `worktrees:prune` | is this branch merged? | correctly answers no, and says nothing |
| `merge-guard` | is this PR safe to merge? | takes a PR number |
| `merge-queue`'s orphaned-commit check (#152) | does this PR's head carry commits beyond the merge? | hangs off a PR head, at merge time |

The third is the complementary half of this one, not a duplicate: it guards the queue's exit, this guards
branches that never entered it.

`agent/ssh-key-defaults` sat pushed for **eleven hours** carrying `requireControlPlaneKey()` and the
removal of a hardcoded SSH key filename, with no PR of any state. It was found by somebody reading a
branch list while looking for something else.

## The obvious check is defeated by squash-merging

`git rev-list --count origin/main..<branch> > 0` looks like the answer. It is not: a squash merge lands
the *content* under a new commit, so every squash-merged branch still reports commits `main` "does not
have". On this repo that test names **66 of 133** — nearly all already landed.

**PR state is the record git cannot reconstruct.** So the population comes from GitHub — every head ref
`gh pr list --state all` has ever seen — and the residue is the branches no PR ever pointed at. That is
the same conclusion `merge-guard.mjs` reached from the other direction about `mergeStateStatus`.

## Commits are the screen; content is the verdict

A branch ahead of `main` has not necessarily got work `main` lacks — it may have been rebased, or its
content landed under another branch's PR. So the commit count is a **candidate**, never a finding, and
what decides it is whether the files the branch changed still differ.

**Three states, and the third is why this file exists.** The investigation that filed the row ran
`git diff --stat A B -- $FILES | tail -1` with `${VAR:-IDENTICAL}` and printed a clean `IDENTICAL` for all
eleven candidates — *including one already shown by hand to differ* — because empty output and "no
difference" are the same string.

| verdict | meaning |
|---|---|
| `DIFFERS` | the branch's own files still differ from `main` — a real finding |
| `SAME` | its content landed, whatever its commit count says |
| `NOTHING COMPARED` | **a refusal.** Nothing was examined, and that is not a pass |

It uses `git diff --quiet`, whose **exit status** is the answer, so there is no output that can be misread
as agreement.

## It reports and never refuses

A stranded branch is a question for a person — rebase it, open a PR, or delete it. A non-zero exit would
put this in a gate's way rather than in a reader's.

It *does* refuse one thing: if **every** pushed branch appears to have no PR, the PR listing returned
nothing rather than 132 branches having been opened without one. `gh auth status` is the fix, and a wall
of false findings is not.
