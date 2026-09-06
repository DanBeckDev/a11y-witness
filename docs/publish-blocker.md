# The npm publish blocker: what needs a human's hands, and what does not

Issue #5 was the checklist for the first publish itself. This is the narrower checklist for #72/#73 — the
token that covers that first publish, and getting rid of it afterwards. Like #5, most of this needs a
human logged into npmjs.com or GitHub's org settings; a worker cannot do it. What a worker *can* do is
build the check that proves it happened, which is `npm run npm-token:check` (below).

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
   row assumes. Without it, `npm-token-liveness.yml` reports `CANNOT_TELL` on every run (see below), which
   is honest but requires a human to run the check by hand instead.

## What is already built, and what it proves

`npm run npm-token:check` (`scripts/npm-token-liveness.mjs`) answers "is `NPM_TOKEN` gone" as one of
**three** states, never two — present, gone, or *could not ask*:

```
npm run npm-token:check              # what it can tell today, from wherever you run it
npm run npm-token:check -- --post    # and comment once on #73 if it is a real finding
```

- **Runs on `push`, never on a schedule** (`.github/workflows/npm-token-liveness.yml`) — the same reason
  `board-liveness.yml` does: GitHub disables a scheduled workflow after 60 days without repository
  activity, silently, so a watchdog that is itself scheduled has the disease it watches for. A push cannot
  be disabled by inactivity, because a push *is* the activity.
- **Before 2026-11-20**, any answer is informational — the token still has a legitimate reason to exist.
- **On or after 2026-11-20**, `NPM_TOKEN` present is the finding #73 describes, and the check refuses to
  guess which of the three causes it is (never configured, configured but left behind, or nobody looked)
  — it names all three on the issue and asks a human to say which before anything is deleted.
- **Asking the question needs org-admin or the scoped `ORG_SECRETS_READ_TOKEN` above.** The repository's
  own `github.token` has neither, so until that secret exists, every push-triggered run reports
  `CANNOT_TELL` — loud, and never silently read as "gone" (which would hide a real outage) or "present"
  (which would false-alarm every ordinary push). Run `gh secret list --org a11ign` by hand, or add the
  scoped token, to get past `CANNOT_TELL`.
