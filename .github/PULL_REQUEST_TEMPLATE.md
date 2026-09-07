<!--
THE `Acceptance:` BLOCK BELOW IS RUN BY CI. `ci.yml`'s `acceptance` job (#353) hands each line to bash and
its EXIT CODE is the verdict; a PR with no acceptance block FAILS `gate` with `ACCEPTANCE: MISSING`, and so
does this template left unfilled. That is deliberate -- a check that finds nothing, runs nothing and
reports green is this repository's most-recorded defect.

The enforcement shipped before the field was documented anywhere an author looks, and five open PRs failed
a gate for something nobody had been told about. Hence these lines at the top, rather than the rules living
in a script header.

HOW THE BLOCK IS READ
  - One command per line under a bare `Acceptance:` header, or inline: `Acceptance: npm run lint`.
  - The block ends at the first blank line, markdown heading, or `Mutation:`.
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
  - Genuinely nothing to run? `Acceptance: none — <reason>`. The em dash matters: `none -- reason` parses the reason as "- reason". The reason is REQUIRED, because "nobody wrote
    one" and "this one deliberately has none" must stay different states.

`Mutation:` is NOT executed -- a mutation edits a real file and a shared runner must not. It is the RECORD:
what you broke, and that the guard bit. `npm run mutate` makes it cheap.

`Closes #N` still belongs on a PR that finishes a row. GitHub does not apply the reference when the bot
performs the merge, so `close-rows.yml` does it explicitly (#298) -- but the keyword is what it reads.
-->

Closes #

Acceptance:

Mutation:

## What changes, and why

<!-- The why matters more than the what here; the diff shows the what. -->

## How you verified it

<!-- Tick what you ran. Not every box applies — see CONTRIBUTING.md for which apply to your change. -->

- [ ] `npm test` (~850 tests, no worker)
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
