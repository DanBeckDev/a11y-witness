# Making `ready` checkable — what the Acceptance field actually contains

**Scoping only. Nothing is built here, and the decision is `ceo`'s.**

The proposed definition is *`ready` = the acceptance command has been run and names a fleet-free failure*.
That turns the label from a memory into a claim about the present. Whether it can be *checked* depends
entirely on what the Acceptance field really holds, so that was measured before any option was written
down.

## The measurement, over all 52 open rows

```
open rows                                              52
  with a `## Acceptance` section                       42        without: 10
  acceptance inside a fenced block                     39        prose-only: #71 #28 #25
  command lines extracted                              66
    fleet/lab-gated                                    25        across 18 rows
    judgeable by EXIT CODE alone                       45
    verdict lives in a TRAILING COMMENT                21
    side effects, must never run at filing time         1        (#70: `git commit -m ... && gh run watch`)
  by kind: npm/node/python 47 · gh 5 · grep/git/du 14
```

## The finding that decides the options

**A tool can extract the command. It cannot extract the verdict — for 21 of 66 lines, about a third.**

```
grep -c 'NOT YOURS TO REPORT' CLAUDE.md            # must be 0 afterwards
npm run gate:isolation                             # 6 of 6
npx a11ign <a url>                                 # its findings appear, labelled with their layer
```

Each **exits 0 while failing**. `grep -c` prints `1` and exits 0; the expected value is in English, beside
the command, where only a person reads it. A runner that judges by exit code would report those rows
green. **That is this repository's own "unchecked is not clean" defect, and building the obvious runner
would install it into the tracker** — the one place whose entire job is to say what is still true.

Two smaller constraints, both cheap to handle once known: one row's acceptance *mutates the repository*
(#70 commits), so any runner needs a refusal rather than a sandbox; and 25 of 66 lines need the fleet, so
a filing-time run cannot execute them — which is not a problem but the actual signal, since a row whose
acceptance needs the fleet is precisely a row that is not `ready` under the proposed definition.

## The options, and what each really costs

| | what it is | cost | what it buys |
|---|---|---|---|
| **A. `row-claim.mjs verify <n>`** | extract the fenced block, run each line, report | **Not the runner — an afternoon. The cost is that it is WRONG on a third of rows until B is done**, and wrong in the direction that reports failure as success | Nothing on its own. **A before B is the trap** |
| **B. Verdicts become exit codes** | every acceptance line judgeable by exit status: `! grep -q ...`, `test "$(grep -c ...)" -eq 0` | one human pass over **21 command lines**, and prose-only rows (#71, #28, #25) get a fenced block or an explicit "no mechanical acceptance" | Makes A correct. **Also makes the field honest for humans** — a line whose expected value is a comment is a line nobody re-runs |
| **C. Filing-time checklist, human** | the filer runs the command and pastes the output with a date into the row | zero to build; it is the rule already adopted | Catches #4, #42 and #10 today. Weakness is the one this repo names most: a rule a human must remember is a rule that does not happen |
| **D. Derive `ready` from EVIDENCE, not from a run** | a row may carry `ready` only if its Acceptance block contains a pasted run — command, output, date. A tool checks that the evidence is PRESENT and RECENT, never re-runs it | small: a text check, no execution, no sandbox, no fleet | **Sidesteps the verdict problem entirely.** It cannot be wrong about a verdict because it never forms one — it asks whether anybody looked |

## Recommendation

**C now, D next, B when someone is in the field anyway, A only if B lands.**

D is the one worth arguing for, because it is the only option whose *failure mode is a false negative*. A
missing paste marks a row unverified when it might be fine — cheap, and visible. Every other option can
report a broken row as green, which is the failure that produced the nine stale rows in the first place.

D also matches what `row-claim.mjs` already does: it reads the BOARD rather than inferring state from git,
and refuses to guess when it cannot ask. Checking for evidence is the same shape as checking for a label.

**A is worth building only after B**, and the honest version of its cost is *"one afternoon plus a
21-line migration nobody has agreed to"*, not *"one afternoon"*.

## What this scoping does not settle

- **Whether the definition is adopted at all** — that is `ceo`'s, and this is the mechanism if it is.
- **Who runs the fleet-gated 25.** Under the proposed definition they cannot be `ready`, which may be the
  right answer or may leave 18 rows permanently unpickable. That is a queue-shape question, not a
  tooling one.
- **The 10 rows with no `## Acceptance` at all.** They are not covered by any option here, and "a row
  with no acceptance" may be a template gap or may be legitimate for `decision` rows. Nobody has looked.
