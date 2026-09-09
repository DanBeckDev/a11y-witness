---
"a11ign": patch
---

**A row's Acceptance saying `npm test` is now refused at FILING, by the same function that refuses it at
PR time.**

`pr-open` already caught the only instance — *"needs `corpus`, which this job does not have —
abstention-regression.test.ts requires corpus via compareAtFloor"*. The acceptance job has no token and no
corpus and runs commands taken from a body, so the whole suite is not something it can run. **A row's
acceptance is written before anybody knows which job will run it**, which is why it has to name the files
the change is verified by rather than the command a developer would type. Asking at filing puts the cost
on whoever still has the context; by PR time it is a rewrite of a section written hours earlier by
somebody who has moved on.

**One implementation, and that is the change rather than a side effect of it.**
`template-fields-rule.mjs` imports `runsTheWholeSuite` and `extractAcceptanceSection` from
`acceptance-commands.mjs` unchanged, so the same command string gets the same answer at both times. A test
drives both entry points over the same strings and asserts they agree — with a guard that the string list
contains both verdicts, since "they agree" is satisfied by a list where nothing is the whole suite.

**Only the command-shape half lifted, deliberately.** `jobCapabilities(body)` and
`unmetCommandRequirements` read a PR body and the capabilities a job declares; at filing time there is
neither, so the requirement half stays where it works. A weaker second copy of a check that already works
is the defect this row exists to avoid.

**The constraint that was expected to decide the shape does not apply, and that is now asserted rather
than remembered.** The row was scoped around `template-fields-rule.mjs` being a pre-install entry — where
an `@a11ign/*` import is refused, and `region-paths.mjs` was extracted rather than imported for exactly
that reason. Measured: `row-file.mjs` and `row-claim.mjs` are invoked by no workflow at all, so neither is
a pre-install entry and the direct import is available. A test fails if a workflow ever invokes one, and
says what to do about it.

**It fails by MISSING, and the limit is stated in the code.** `runsTheWholeSuite` is a positive test for
two spellings, `npm test` and `npm run test:ts`. A third spelling of the same thing — a shell alias,
`npm run test --workspaces`, a Makefile target, `node --test` with the glob written out — reads as "not
whole-suite" and is then classified by the files it names, which for a command naming none is nothing to
check. Moving the check earlier moves that miss earlier too. It stays silent rather than inventing data,
and the honest remedy is a check on what a command RUNS rather than a longer alternation.

Presence and content stay separate refusals: a row with no Acceptance is refused as missing it, never as
naming the wrong command.
