# ADR 0007: Independent semver via Changesets, and the isolation gate

**Status:** accepted
- Date: 2026-08-05

## Context

Goal 2 is stability through semantic versioning: a consumer pins a version they
trust and upgrades on their own schedule. Nothing in the repo supports that today —
one `0.0.0`, no changelog, no tags, no release pipeline.

The repo already uses Conventional Commits (`feat(dataset):`, `fix(dataset):`,
`docs(release):`), which makes `semantic-release` the obvious reach. It is the wrong
reach for a specific reason, and the reason is worth stating because it recurs.

**A commit message cannot express a monorepo release.** One commit here routinely
touches the worker and the fleet and the judge; `fix:` says which *kind* of change
it is, not which packages it releases or at what level. And the dependent-bump
problem has no commit-message expression at all: bumping `evidence` to `2.0.0`
requires bumping `judge`, `worker-fleet` and the CLI, because their declared ranges
(ADR 0005) would otherwise resolve a version that no longer exists in-workspace.

**This project's failure mode is checks that exist but do not run.** CLAUDE.md
records it three times: `capture-check` was required after any capture change and
had never run; `release:gate` was broken from the day it was written; the acceptance
gate sat failing while three others were green. A release process that depends on
remembering to do something is a release process that will ship a broken tarball.

## Decision

### 1. Changesets, with independent per-package versioning

`@changesets/cli`, configured `"linked": []` and no fixed groups, so every package
versions on its own. A change that only touches `nvda-worker` publishes
`nvda-worker` and nothing else — which is the entire point of ADR 0004's
boundaries, and what Clean Code (2nd ed., §"Independent Deployability") describes as
the payoff: only the changed unit gets redeployed.

Changesets is chosen over the alternatives for three concrete capabilities:

- It resolves the **dependent bump graph** automatically, including rewriting the
  intra-repo ranges ADR 0005 declares.
- The changelog entry is **written by the author, at authoring time, in the PR** —
  a human sentence about consumer impact rather than a machine paste of commit
  subjects. Continuous Delivery (Humble & Farley, 2010, §"Managing Libraries")
  makes traceability of what went into a binary the point of componentised
  releases; a changelog assembled from `fix(dataset): the page furniture satisfied
  a case's own signal` gives a consumer nothing.
- Bump level is an explicit choice per package, which is necessary because in this
  repo the levels do not follow from the code. A retrain of the scorer changes no
  API and is a **major**; a 40-line refactor inside `capture-core.mjs` that
  `evidence:check` reports as SAME changes plenty of code and is a **patch**.

Conventional Commits stay, for history and for the existing hooks. They are not the
release input.

### 2. Semver, defined for artefacts that are not APIs

Two packages need this spelled out or their versions will lie.

**`@a11y-witness/scorer` — the weights are the API.**
- **major**: any retrain, any threshold change, any encoder swap. A consumer's
  build goes from passing to failing with no code change; that is breaking, whatever
  the diff looks like.
- **minor**: a new optional output field that existing readers ignore.
- **patch**: packaging, path resolution, provenance metadata.
- Every release records the training-report provenance (corpus, encoder hash,
  thresholds) in the changelog entry, because "which model scored this" is the
  question a disputed finding turns on.

**`@a11y-witness/nvda-worker` — the wire protocol versions separately.**
`CAPTURE_PROTOCOL_VERSION` is a capture-cache key: bumping it invalidates 2,122
cached captures. Package semver is a consumer-facing compatibility claim. They must
not be the same number, in either direction — a package major must not force a
recapture, and a protocol bump must not wait for a major. Rules:
- A `CAPTURE_PROTOCOL_VERSION` bump is **at least a minor** on the package and the
  changelog entry must say "invalidates cached captures".
- A change to the `/capture` or `/health` response shape is a **major**, protocol
  bump or not, because a host pinned to the old package parses the old shape.
- `npm run evidence:check` reporting SAME is what makes a worker change a patch.
  That tool is now load-bearing for versioning, not just for cache economics.

**`@a11y-witness/evidence`** carries the strictest promise: additive only, for a
long time. Removing a subpath from `"exports"`, or narrowing a predicate's
behaviour, majors every downstream package.

### 3. Release pipeline: tag-free, CI-published, provenance-signed

1. A PR that changes any `packages/*` source **must** include a changeset. CI fails
   without one. This is the changelog discipline — enforced, not requested, because
   of the three unrun checks above.
2. Merge to `main`. The Changesets action opens or updates a single "Version
   Packages" PR holding every pending bump and changelog edit.
3. Merging that PR publishes to npm from CI with `--provenance` and pushes
   per-package git tags (`@a11y-witness/judge@1.2.0`).
4. `0.x` for every package until M9. **This is deliberate**: `0.x` means breaking
   changes are cheap, so a boundary that turns out wrong can be corrected without a
   major-version apology. Publishing `1.0.0` before an external consumer has used
   the API is the mistake — it converts a guess into a promise.

### 4. The isolation gate — the check this whole plan rests on

Before any package publishes, and on every release PR:

```
npm pack --workspace <pkg>
cd $(mktemp -d)                 # outside the repo, empty node_modules
npm init -y && npm i <tarball>
<run the package README's first example>
```

It must run **outside the repository tree**, because every failure this catches is
a path or a dependency that only resolves from the repo root:

- **phantom dependencies**, which ADR 0005 accepts npm's hoisting will permit;
- **cwd-relative resolution**, which `local-judge.ts:311-312` demonstrably has
  today (`".venv/bin/python"`, `"scripts/score-screenreader-model.py"`);
- **files missing from `"files"`** — the `.cmd`, `.ps1` and `.safetensors` payloads
  are exactly the kind of non-`.js` asset an allow-list drops silently;
- **`"exports"` maps that do not resolve** the subpaths the README uses.

Nothing else in this plan can catch these. A workspace install resolves everything
by symlink and repo-root cwd, so the workspace is structurally incapable of
detecting them. Continuous Delivery's smoke-test-the-deployed-binary discipline,
applied to a tarball.

And per this repo's own rule — **a guard must be shown to fail before it is
trusted.** The gate is not accepted until it has been demonstrated to reject a
package with a deliberately omitted dependency and a package with a deliberately
truncated `"files"`. A gate written against an unverified shape is the count-based
check all over again.

### 5. How a consumer pins and upgrades

- **Pin** with a caret on the CLI (`a11y-witness@^1`) and **exactly** on the
  scorer (`@a11y-witness/scorer@1.4.0`), because a caret on the scorer is a caret on
  the findings. Documented in each README, with the reasoning, because a consumer
  who does not know the weights are the API will pin the wrong way.
- **Upgrade** by reading the scorer changelog first: it is the only package whose
  patch release can change a verdict, and the provenance line tells them which
  corpus moved.
- **Reproduce** a historical run: the CLI's report records every resolved package
  version alongside the existing capture provenance, so a finding from six months
  ago can be re-derived. This is a small addition to `report.ts` and it is the thing
  that makes "we found this" auditable.

## Consequences

- Six packages can move at six speeds. The worker changes weekly; `evidence`
  should change twice a year.
- A consumer can adopt a worker fix without accepting a retrained model, which is
  today impossible and is the single biggest stability gain in this plan.
- The release path runs in CI on every release PR, so it cannot rot unobserved the
  way `release:gate` did.
- Cost: a changeset per PR is real friction, and CI enforcement means it is
  non-negotiable friction. It is the cheapest available way to get changelogs that
  are worth reading.

## Alternatives considered

- **semantic-release.** Fits the existing Conventional Commits and needs no extra
  authoring step. Rejected: no dependent-bump handling across a workspace, and
  commit type cannot express the two cases in §2 where the correct level does not
  follow from the diff.
- **Fixed/lockstep versioning** (one version for all six). Simple, and wrong — it
  reintroduces exactly the coupling ADR 0004 paid to remove; a scorer retrain would
  major the worker.
- **Manual tag-based releases.** Feasible at six packages, and it depends entirely
  on a human remembering. This repo has a documented record of what that produces.
- **Publishing only the CLI, keeping the rest private.** Cheapest, and it fails
  goal 1 for every consumer who wants to score archived captures or run a worker
  pool.

## Residual risks

1. The isolation gate cannot pass for `@a11y-witness/scorer` until
   `scripts/score-screenreader-model.py` is restored to `main` (ADR 0004, risk 1).
2. It needs a Python environment and an 87 MB encoder fetch for the scorer and
   judge cases, which makes that gate slow and network-dependent. It may have to be
   release-only rather than per-PR — in which case say so out loud, because this
   repo's history is checks that quietly did not run.
3. `--provenance` requires publishing from CI with an npm trusted publisher or
   OIDC; if that is not set up, provenance silently does not happen.
4. Nobody has yet consumed any of these APIs, so every `0.x` boundary is a guess.
   The `0.x` window is the mitigation, not a claim that the guess is good.

## Re-validated 2026-08-22 — challenged, researched, and the decision holds for a stronger reason

The choice above was made in 2026-08 and had never been checked against the field. It was challenged
directly ("is Changesets the best solution — have you researched?"), so here is the answer, with the
evidence that was not in the original.

### What the alternatives actually are

| tool | verdict for THIS repo |
|---|---|
| **semantic-release** | **Out.** It assumes one repo = one package and has no monorepo support. The community `semantic-release-monorepo` plugin has not been committed to since March 2022 and is not built for npm workspaces. |
| **release-please** | **Viable, and fatally commit-driven** (see below). Its `node-workspace` plugin does handle cross-package dependency updates under npm workspaces. Against it: the original action was archived in August 2024, the v3→v4 upgrade was breaking, and there are reports of release PRs silently ceasing to be created. |
| **Nx release / Lerna** | Both bring an orchestration layer this repo does not otherwise need. ADR 0005 already chose plain npm workspaces over a heavier toolchain, and adding one for versioning alone inverts that. |
| **Changesets** | **Kept.** Actively maintained — `@changesets/cli` 3.0.1, published 2026-08-19, days before this review. npm workspaces are supported. It has the most mature independent-versioning story of the three and is what Vercel and Radix use. |

### The decisive argument, which the original ADR asserted and did not measure

The original said "bump level is an explicit choice per package, which is necessary because in this repo
the levels do not follow from the code". That is the reason release-please is unusable here, and it is now
**measured on this repository's own history** rather than argued:

```
breaking-change markers in the entire history (`!:` or `BREAKING CHANGE:`)   0
commits that changed the shipped weights                                    14
   ... how a conventional-commit parser would read those 14:
       fix   -> patch      6
       feat  -> minor      4
       chore -> NO RELEASE 3
       revert              1
```

By this ADR's own semver rules, **every one of those 14 is a major** — "any retrain, any threshold change,
any encoder swap. A consumer's build goes from passing to failing with no code change; that is breaking,
whatever the diff looks like."

So a commit-message-driven tool would have shipped **zero majors where fourteen were required**, and for
three of them **no release at all** — the weights would have changed under consumers on a `chore`. That is
not a stylistic preference between tools. It is the difference between a version number that means
something and one that lies, on the package where lying costs the most.

The generalisable form: **a tool that derives the release from the commit can only be correct when the
diff predicts the impact.** In this repo it does not, in both directions — a retrain changes no API and is
breaking, while a 40-line refactor of `capture-core.mjs` that `evidence:check` reports as SAME is a patch.

### One thing to carry into the implementation

With npm workspaces specifically, `changeset version` does not update `package-lock.json`. **Run
`npm install` immediately after it, in the same job**, or the lockfile ships describing the previous
versions — a stale-artefact failure of exactly the kind this project keeps paying for, and one that would
be invisible until a consumer's clean install resolved the wrong tree.

Sources: [changesets.dev](https://changesets.dev/),
[@changesets/cli on npm](https://www.npmjs.com/package/@changesets/cli),
[npm release automation compared](https://oleksiipopov.com/blog/npm-release-automation/),
[why release-please over semantic-release](https://blog.hazya.dev/why-i-swapped-semantic-release-for-release-please).
