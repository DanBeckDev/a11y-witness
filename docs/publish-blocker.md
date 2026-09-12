# The npm publish blocker: what needs a human's hands, and what does not

Issue #5 was the checklist for the first publish itself. This is the narrower checklist for #72/#73 — the
token that covers that first publish, and getting rid of it afterwards. Like #5, most of this needs a
human logged into npmjs.com or GitHub's org settings; a worker cannot do it. What a worker *can* do is
build the check that proves it happened, which is `npm run npm-token:check` (below).

## The token's scope — issue #304

**Written down here so the human doing #5 step 2 or #72's configuration does not invent the answer at
the keyboard, under time pressure, on the one step that hands out publish rights.** Every fact below is
checkable by the command shown; none of it is typed from memory.

**The six packages**, derived from the workspace rather than hand-listed — a package is publishable when
its own `package.json` does not set `"private": true`:

```
$ npm query .workspace --json | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);\
process.stdin.on('end',()=>console.log(JSON.parse(d).map(p=>p.name)))"
```

| package directory | published name | publishable? |
|---|---|---|
| `packages/cli` | `a11ign` | yes |
| `packages/evidence` | `@a11ign/evidence` | yes |
| `packages/judge` | `@a11ign/judge` | yes |
| `packages/nvda-worker` | `@a11ign/nvda-worker` | yes |
| `packages/scorer` | `@a11ign/scorer` | yes |
| `packages/worker-fleet` | `@a11ign/worker-fleet` | yes |
| `packages/control` | `@a11ign/control` | no — `"private": true` |
| `packages/lab` | `@a11ign/lab` | no — `"private": true` |
| `packages/nvda-speech` | `@a11ign/nvda-speech` | no — `"private": true` |

**These are today's names.** #66 (the `a11ign` rename) changes the unscoped package's name and the
`@a11ign` scope before the transfer — #72's own acceptance script already writes the scope as
`@a11ign`. **A token or trusted publisher scoped to today's six names must be re-scoped to the renamed
ones once #66 lands, or it grants publish rights to names that no longer exist and silently denies the
ones that do.**

**The repository and workflow.** `release.yml` is the only workflow that publishes or invokes changesets
— confirmed, not assumed:

```
$ grep -l 'npm publish\|changesets/action' .github/workflows/*.yml
.github/workflows/release.yml
```

Its job is named `release`, triggered only by `workflow_dispatch` (never a push or a schedule), and the
publish step itself is gated on `inputs.dry-run == false && inputs.confirm == 'publish-for-real'` — see
the workflow's own comments for why that double gate exists. **A trusted publisher (or a granular token's
repository restriction) must name `a11ign/a11ign`, workflow `release.yml`** — the POST-transfer, POST-
rename location, per #72's own body — not the current `a11ign/a11ign`, which is where the
repository lives only until #63 and #66 land.

**The two secrets this repository actually uses**, so #63's transfer re-creates exactly these and no
more:

- **`NPM_TOKEN`** — read by `release.yml`'s `Publish` step as `NODE_AUTH_TOKEN`. The one credential that
  can actually publish. Covers the first publish only; #72 configures trusted publishing (OIDC, no
  standing token) for all six packages afterwards and revokes it.
- **`ORG_SECRETS_READ_TOKEN`** — read only by `npm-token-liveness.yml`, to answer "does `NPM_TOKEN` still
  exist" without needing org-admin. Deliberately far weaker than `NPM_TOKEN`: scoped to nothing but the
  organisation's "Secrets: read" permission, so it can list secret *names* and cannot publish anything.
  Optional — without it the liveness check reports `CANNOT_TELL` rather than guessing.

**Which of these change on the org move.** Both already do NOT need re-creating, and that is deliberate
rather than lucky: `NPM_TOKEN` is stored as an **organisation-level** Actions secret on `github.com/
a11ign` (not a repository secret on `a11ign/a11ign`), specifically so the repository transfer
in #63 does not lose it — #63's own point 2 names "Actions secrets... do not transfer" as one of the four
silent breakages, and this secret was placed at the org level in anticipation of exactly that. Once the
repository joins the `a11ign` organisation, it inherits the secret automatically. `ORG_SECRETS_READ_TOKEN`,
when created, is the same shape for the same reason. **What DOES need re-doing after #63/#66 land is the
package list and the trusted-publisher configuration above** — those name the CURRENT repository location
and package names, not the org-level secret, and #72's own configuration step is where that happens.

## What exists today, checked 2026-09-06

- `NPM_TOKEN` is an organisation-level Actions secret on `github.com/a11ign`, created 2026-09-06,
  expiring 2026-12-05 (90 days).
- `.github/workflows/release.yml` requests `id-token: write` (line 48) and is ready for trusted
  publishing — it does not need to change for this.
- No package has been published yet (`.changeset/config.json` still reads `"access": "restricted"`, per
  #5), and the org/scope name is not settled (`PLAN.md` B5 — "the name, and the first publish (yours)").
  So every step below that says "for each package" cannot literally be done until B5 and #5's steps 1–4
  are.

## Steps that need a human, in order

1. **Before 2026-09-15 — settle the sequencing question.** npm's trusted-publishers documentation does
   not say whether a trusted publisher can be attached to a package name that has never been published.
   Attempt to configure one, on npmjs.com, for a single scoped name that does not exist yet. Record which
   way it went on #72:
   - If it can be saved → the first publish can go out via trusted publishing directly, and `NPM_TOKEN`
     may never be used at all.
   - If it cannot (the package must exist first) → the first publish is by token, as planned, and
     trusted publishing is configured immediately afterwards, before anything else touches the token.
2. **After the first publish (#5's steps) — for each of the six packages**, on npmjs.com: package
   settings → configure a trusted publisher → GitHub Actions → repository and workflow pointing at
   `release.yml`.
3. **Revoke `NPM_TOKEN`.** Not "let it expire" — delete it, and say on #72 that it was deleted and when.
   A credential that stops working on 2026-12-05 because nobody renewed it is a deadline that happened to
   arrive, not a decision.
4. **Optional, and it is the one thing that makes #73 able to answer itself automatically**: create a
   **fine-grained personal access token scoped to nothing but the `a11ign` organisation's "Secrets: read"
   permission**, and store it as the organisation secret `ORG_SECRETS_READ_TOKEN`. This is a much smaller
   credential than `NPM_TOKEN` — it can list secret *names*, not values, and it cannot publish anything —
   but it is still a standing credential, so creating it is a deliberate decision and not something this
   row assumes. Without it, the token watchdog reports `CANNOT_TELL` on every run (see below), which
   is honest but requires a human to run the check by hand instead.

## What is already built, and what it proves

`npm run npm-token:check` (`scripts/npm-token-liveness.mjs`) answers "is `NPM_TOKEN` gone" as one of
**three** states, never two — present, gone, or *could not ask*:

```
npm run npm-token:check              # what it can tell today, from wherever you run it
npm run npm-token:check -- --post    # and comment once on #73 if it is a real finding
```

- **Runs on `push`, never on a schedule** — as a `continue-on-error` step in `.github/workflows/trunk-guard.yml`'s
  `watchdogs` job since #901 (it was a workflow of its own, `npm-token-liveness.yml`, until 2026-09-10). The
  reason is the same one the board watchdog has: GitHub disables a scheduled workflow after 60 days without
  repository activity, silently, so a watchdog that is itself scheduled has the disease it watches for. A
  push cannot be disabled by inactivity, because a push *is* the activity.
- **Before 2026-11-20**, any answer is informational — the token still has a legitimate reason to exist.
- **On or after 2026-11-20**, `NPM_TOKEN` present is the finding #73 describes, and the check refuses to
  guess which of the three causes it is (never configured, configured but left behind, or nobody looked)
  — it names all three on the issue and asks a human to say which before anything is deleted.
- **Asking the question needs org-admin or the scoped `ORG_SECRETS_READ_TOKEN` above.** The repository's
  own `github.token` has neither, so until that secret exists, every push-triggered run reports
  `CANNOT_TELL` — loud, and never silently read as "gone" (which would hide a real outage) or "present"
  (which would false-alarm every ordinary push). Run `gh secret list --org a11ign` by hand, or add the
  scoped token, to get past `CANNOT_TELL`.
