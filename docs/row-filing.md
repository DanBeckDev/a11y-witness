# Filing a backlog row: `npm run row-file`

`.github/ISSUE_TEMPLATE/backlog-row.yml` marks Region, Acceptance and Open-check `required` — but that is a
GitHub issue **form**, and forms apply only in the web UI. Every row this fleet files goes through
`gh issue create --body`, which bypasses the form entirely: there is no field to leave blank, because there
are no fields.

Measured 2026-09-09 (#735, worker-capture): of 76 open rows, 36 were missing at least one required section
(25 missing Region, 5 missing Acceptance, 28 missing Open-check) — and the rate was **worse** on the
newest rows (82% of `#700+`) than the oldest (22% of `#0–399`), because the more the org files its own
work with `gh issue create`, the more of the backlog becomes un-claimable. `row-claim.mjs` (#707) already
refuses to claim such a row, naming the missing field — but that refusal lands on whoever picks the row up
later, with less context than whoever filed it had.

## Use this instead of `gh issue create` directly

```sh
npm run row-file -- --title "..." --body "## Region\n\n...\n\n## Acceptance\n\n...\n\n## Open-check\n\n..." [any other gh issue create flag]
# or
npm run row-file -- --title "..." --body-file /path/to/body.md [any other gh issue create flag]
```

`scripts/row-file.mjs` reads exactly the body this invocation would file — from `--body`/`--body=` or
`--body-file`/`--body-file=` — and checks it against the **same rule** `row-claim` already enforces at
claim time (`missingTemplateFields`, imported unchanged from `scripts/row-claim/template-fields-rule.mjs`,
#707). If a required section is missing, it refuses and names which one, before `gh` ever runs. If the body
is complete, every argument is forwarded to the real `gh issue create` unchanged — this wrapper adds
exactly one check and nothing else.

Every other flag `gh issue create` accepts (`--label`, `--assignee`, `--milestone`, `--project`, …) passes
straight through; this tool does not enumerate or restrict them.

## Why this and not a stricter check

The population is not static — every row a session files adds to it, so a one-time sweep's number is stale
before it can be read. The fix is a check that runs at the moment a row is created, not a count pinned into
a row body. `tracker-auditor`'s hourly report separately counts open rows still missing a section, so the
population's current size stays visible without depending on every filer having used this tool.

**This does not relax the claim-time gate**, and should not: an `Open-check` is what stopped three of six
rows seeded on 2026-09-06 being worked after they were already fixed. It also does not weaken to counting
headings rather than content — a `## Open-check` with nothing under it still refuses, because it asserts
exactly what `row-claim` asserts (`hasTemplateField`'s "real content under it", not a bare heading match).

## Writing a section that has no content: say so, never leave it blank

Two rules from the 2026-09-09 backfill, in the guidance rather than in the heads of whoever did it.

**A section that is genuinely empty gets a sentence, not a blank.** A row that changes no file writes
`Region: none — this row changes no file, because …`, and a row with nothing to invert says so under
Mutation. *"This row touches nothing"* and *"nobody wrote the section down"* are different states and no
audit can tell them apart, so a blank leaves the row in the missing-section count forever and reads as an
oversight. #149 (a parent that deletes nothing), #72 (a change only an npm org owner can make) and #668
(a count each session accounts for) are the worked examples.

**And an invented section is worse than an absent one.** A plausible-looking Acceptance gets built
against; a blank one is visible. Where the sections are written by somebody other than the filer — the
backfill marked each *"sections written by the PM from the filing, filer to confirm"* — the mark is an
invitation to **replace**, never to append: a second `## Acceptance` beside the first is what #746
measured going red as `DUPLICATE -- 2 sections found`.
