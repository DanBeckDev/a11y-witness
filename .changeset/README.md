# Changesets

The release machinery from [ADR 0007](../docs/adr/0007-versioning-and-release.md), re-validated against
the alternatives on 2026-08-22. **Nothing has been published yet** — the name is undecided (PLAN.md, B5),
and this exists so that when it is decided, releasing is a config change rather than a scramble.

## Adding one

```bash
npm run changeset          # pick packages, pick bump levels, write the sentence
```

It writes a markdown file here. Commit it with your change; CI checks it is there.

**Write the entry for a consumer, not for us.** It goes into the changelog verbatim, and the whole reason
this project uses author-written entries rather than generated ones is that
`fix(dataset): the page furniture satisfied a case's own signal` tells a consumer nothing.

## Choosing the bump level — it does not follow from the diff

This is the reason a commit-message-driven tool cannot work here, and it is measured in ADR 0007: of the
14 commits that have changed the shipped weights, a conventional-commit parser would have read six as
patches, four as minors and **three as no release at all**. All fourteen are majors.

| package | major means |
|---|---|
| `@a11y-witness/scorer` | **any retrain, any threshold change, any encoder swap.** The weights ARE the API: a consumer's build goes from passing to failing with no code change. Record the training-report provenance — corpus, encoder hash, thresholds — in the entry, because "which model scored this" is what a disputed finding turns on. |
| `@a11y-witness/nvda-worker` | a wire-protocol change a host cannot ignore. **Not** the same as `CAPTURE_PROTOCOL_VERSION`, which is a capture-cache key: a package major must not force a recapture, and a protocol bump must not wait for a major. |
| everything else | ordinary semver on the exported API. |

A 40-line refactor of `capture-core.mjs` that `evidence:check` reports as SAME is a **patch**, however
large the diff.

## Config choices worth knowing

- **`"linked": []`** — every package versions independently, which is the payoff ADR 0004's boundaries
  were drawn for: a change touching only `nvda-worker` publishes `nvda-worker` and nothing else.
- **`"access": "restricted"`** — deliberately NOT `public`. Until B5 is settled, an accidental publish
  should fail rather than put a package under a name we may not keep. On a free npm account a restricted
  publish errors outright, which is the failure direction we want. **Change this to `public` in the same
  change that cuts the first release, not before.**
- **`@a11y-witness/lab` and `@a11y-witness/nvda-speech` are `private`** and are skipped automatically.
  `lab` ships nothing by design — what ships is its output.

## Promoting a trained model is a release, and it writes its own changeset

`npm run promote:model -- --from=<candidate>` is the only supported route from a trained candidate into
`packages/scorer/models/screenreader-scorer`. It exists because **promoting a model IS a release of
`@a11y-witness/scorer`** — the weights are that package's API — so it belongs in this machinery rather
than beside it.

It refuses unless the candidate's OWN reports say it earned promotion: `releaseEligible` in the training
report, and `passed` in the acceptance report. Both are read back; neither is a flag you can set. The
failure that prevents is promoting a model because you believe it is good, which is exactly the state of
mind in which the belief is wrong.

Then it writes the changeset at **major**, with the provenance filled in from the training report — the
records, the floor and its source, the encoder, and every per-subtype threshold. ADR 0007 requires that
provenance "because 'which model scored this' is the question a disputed finding turns on", and until this
existed it was a human remembering to type it.

Weights and changeset are left **uncommitted**. Review both and commit them together; publishing is
`release.yml`'s business and is guarded separately.

## The npm-workspaces trap

`changeset version` does **not** update `package-lock.json`. Run `npm install` immediately afterwards, in
the same job, or the lockfile ships describing the previous versions — invisible until somebody's clean
install resolves the wrong tree. `release.yml` does this; if you version by hand, you must too.
