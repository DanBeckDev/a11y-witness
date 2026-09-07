# Which checkout drives the fleet, and why the guards need telling

One machine drives the fleet. Its checkout is special: `assertFleetRunsThisCheckout` hashes its **working
tree**, and every worktree's `node_modules` resolves `@a11ign/*` through **its** `packages/*/dist`.
So a branch parked there silently changes what every other agent compiles and tests against, and a capture
run stamps the corpus with whatever it happens to be holding.

Two hooks protect it: `pre-commit` refuses commits there, and `post-checkout` keeps it detached at
`origin/main`.

```bash
npm run primary:mark              # is this checkout marked?
npm run primary:mark -- --set     # mark it — do this once, on the machine that drives the fleet
npm run primary:mark -- --unset   # stop treating this checkout as the primary
```

## Why it must be told rather than work it out

Until #198 the hooks identified the primary by `.git` being a real directory. That is correct for
`prune-worktrees.mjs`'s question — *within one repository, is this the primary worktree or a linked one?* —
and it answers nothing about **which machine this is**, because a real `.git` directory is true of every
ordinary clone.

`core.hooksPath` is committed, so `post-checkout` travelled to the lab with a `git pull`. `run-job.yml`
then does the one thing it forbids — `git checkout --detach <sha>` at the ref you asked for, which is how
**every lab job runs at a branch** — and every `lab:job -e ref=<branch>` began failing. `-e ref=main` still
worked, so it presented as *"branches are broken"* rather than as a hook.

## The mark is LOCAL git config, and that is the whole point

`git config --local` lives in `.git/config`, which is **not cloned and not pulled**. A lab pull, a worker
deploy or a colleague's clone cannot acquire it, and no file in the tree can carry it there by accident.
A marker file would work and is one `cp` from travelling; an absolute path breaks when the checkout moves.

**Both conditions are required**, and the first attempt at the fix got this wrong:

| condition | question it answers |
|---|---|
| `.git` is a directory | this is the primary **worktree**, not a linked one |
| the mark is set | this **clone** is the fleet-driving one |

A linked worktree **shares `.git/config`** with the repository it was created from, so the mark alone would
have made every worktree read as the primary and `pre-commit` would have refused commits in the very
worktrees every agent works in. `primary-checkout-guard.test.ts`'s two linked-worktree cases caught it.

## An unmarked checkout is not guarded, and that gap is reported

That is the correct default — a guard firing on machines it was never meant for is what #198 was — but
*unmarked* and *safe* must not read the same. `npm run doctor` reports an unmarked primary, and the
command above is what closes it.
