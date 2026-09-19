<!--
THE `Acceptance:` BLOCK BELOW IS RUN BY CI, AND SINCE 2026-09-17 IT BLOCKS THE MERGE. `ci.yml`'s
`acceptance` job (#353) hands each line to bash and its EXIT CODE is the verdict; a PR with no acceptance
block reports `ACCEPTANCE: MISSING`, and so does this template left unfilled. That is deliberate -- a check
that finds nothing, runs nothing and reports green is this repository's most-recorded defect.

`acceptance` and `ownedPaths` are back in `gate`'s `needs`, so THIS IS NO LONGER RED-BUT-MERGEABLE. It was
for a while: `gate` is the only required context, so a job outside its `needs` still ran, still reported and
still painted the PR red -- it simply could not stop anything, and two pull requests merged red in two days
through that gap. Both of the fields below are now worth getting right first time.

IT NO LONGER BLOCKS THE MERGE, and this paragraph used to say it did. #902 removed `acceptance` from
`gate`'s `needs:` (ci.yml:519 lists `changed, ts, python, ansible, changeset, rulesFitness,
deliberateRefusals` and not this job) after measuring that of forty red `ci` runs on pull requests, THIRTEEN
were a real test, lint or typecheck failure and the rest were process jobs. It still runs and still reports
its own verdict; a red `acceptance` is a thing to read, not a wall. An outside contributor whose change is
covered by `npm test` can say so in one line and move on.

The enforcement shipped before the field was documented anywhere an author looks, and five open PRs failed
a gate for something nobody had been told about. Hence these lines at the top, rather than the rules living
in a script header.

HOW THE BLOCK IS READ
  - One command per line under an `Acceptance:` header -- a markdown heading works too (`## Acceptance`,
    `## Acceptance:`, `### Acceptance:`), the bare form (`Acceptance:`) and bold (`**Acceptance:**`) all
    work identically -- or inline on the header's own line: `Acceptance: npm run lint`.
  - The block ends at the first blank line, markdown heading, or `Mutation:`.
  - A command wrapped in backticks (`` `npm run lint` ``) is unwrapped before it runs, and a line ending in
    `\` continues onto the next, exactly as a real shell script would read it (#419).
  - DO NOT put an HTML comment on the line after `Acceptance:` -- the parser has no notion of one and will
    hand it to bash as a command. That is why all of this sits above the header.

RULES WORTH KNOWING BEFORE YOU WRITE ONE
  - It must be a RUNNABLE COMMAND, not prose about one. A line like "RAN `git grep ...` -> clean" exits 127.
  - A command whose CORRECT behaviour is a non-zero exit must say so:
        node scripts/thing.mjs --bogus; test $? -eq 2
    `! <cmd>` also passes on exit 1, which usually means something else entirely.
  - A command naming a file or glob that matches nothing is REFUSED before it runs. `tsx --test` exits 0 on
    a glob matching nothing, and exits 0 on a typo'd path mixed with a real one -- measured on #350, where
    "24 pass, 0 fail" was five files examined and the one that mattered silently skipped.
  - `fleet:*`, `lab:*`, `training:capture*`, `worker:*`, `evidence:check`, `gate:stability` and
    `capture:check` are REFUSED and named, never run: a runner has no Windows worker and no Proxmox. Same
    for anything reading `runs/` (`rules:gate`, `rules:coverage`, `check-signals`, `corpus:starvation`,
    `scorer:shortcuts`) -- gitignored here, so the gate would examine nothing and report cleanly. Name it
    and say who runs it.
  - NAME WHAT PROVES *THIS ROW*, NOT THE WHOLE SUITE. `ci.yml`'s `ts` job ALREADY runs every test the
    diff reaches, in parallel with this one, on the same tree -- so `npm run test:org` or `npm test` here
    is a second full run of tests that are already running, and it pays for itself twice. Measured
    2026-09-19 across four runs: `ts` 154-176 s and `acceptance` 186-193 s, side by side, for one change.
    Name the file, the guard, or the command whose output IS the row's claim:
        node packages/guards/src/assert-glob-not-empty.mjs "packages/lab/src/packaging/wake.test.ts" \
          --min=1 --run --runner=rstest
    A whole-suite command is right only when the row's claim genuinely IS "the whole suite still passes"
    -- a runner upgrade, a dependency bump, a config change with no single owner. That is rare, and when
    it is true, say why on the row so the next reader can tell it from a habit.
  - Genuinely nothing to run? `Acceptance: none — <reason>`. The em dash matters: `none -- reason` parses the reason as "- reason". The reason is REQUIRED, because "nobody wrote
    one" and "this one deliberately has none" must stay different states.

`Mutation:` is NOT executed -- a mutation edits a real file and a shared runner must not. It is the RECORD:
what you broke, and that the guard bit. `npm run mutate` makes it cheap.

`Closes #N` still belongs on a PR that finishes a row. GitHub does not apply the reference when the bot
performs the merge, so `trunk.yml`'s `closeRows` job does it explicitly (#298, #909) -- but the keyword is what it reads.

  - NO ROW? Write `Closes: none -- <reason>` (em dash, like the `Acceptance:` escape hatch above). The
    declaration is REQUIRED either way: a missing one reports `CLOSES: MISSING` and now blocks. This form
    was undocumented here until 2026-09-17, and its absence is exactly how two PRs went red for a field
    whose escape hatch the template never mentioned -- delete the `Closes #` line below and write this one
    instead when there is no row.
-->

Closes #

Acceptance:

Mutation:

## What changes, and why

<!-- The why matters more than the what here; the diff shows the what. -->

## How you verified it

<!-- Tick what you ran. Not every box applies — see CONTRIBUTING.md for which apply to your change. -->

- [ ] `npm test` (the product suite: ~1,800 tests, no worker, no network)
- [ ] `npm run lint` and `npm run typecheck`
- [ ] `npm run training:check-signals` — if you touched a probe's output shape or a case definition
- [ ] `npm run capture:check -- --worker=<url>` — **required** if you touched `capture-core.mjs`
- [ ] `npm run evidence:check <worker>` — if you touched the capture pipeline; says whether the evidence
      moved rather than whether the timing did
- [ ] Not verifiable locally, and here is why:

## If you changed a guard or a gate

- [ ] I introduced the fault and watched the check fail, then fixed it

<!-- Two guards in this repo passed against a corpus containing the exact defect they were written for.
     A guard that has never been red is a guard nobody has tested. -->

## If you changed the capture pipeline

- [ ] `CAPTURE_PROTOCOL_VERSION` is unchanged, **or** the change alters what the evidence *means* and a full
      recapture is intended
- [ ] The remedy is reachable from **every** path that needs it, not just the one I was looking at

<!-- The most expensive recurring defect here is a correct, commented fix applied at one call site when the
     behaviour reaches several. -->

## Anything a reviewer should be sceptical of

<!-- A number without a measurement behind it, an assumption you could not check, a path you could not test. -->
