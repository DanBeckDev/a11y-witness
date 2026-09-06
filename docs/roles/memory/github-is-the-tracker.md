---
name: github-is-the-tracker
description: a11y-witness's tracker is GitHub Issues + Project 2, not docs/backlog.md; the milestone carries its own date-move log.
metadata:
  type: project
---

Since 2026-09-06, "what is open" for a11y-witness is **GitHub Issues on DanBeckDev/a11y-witness**, not
`docs/backlog.md`. The markdown files stay as the RECORD of lessons and link to issues.

- Board: https://github.com/users/DanBeckDev/projects/2 — Status is Ready / In progress / Awaiting merge /
  Fleet-gated / Blocked / Done. The dispatcher pulls from Ready.
- Milestone `v0.1.0 — first publish`, due 2026-09-20 (approved by ceo 2026-09-06). **Every move of that
  date is appended to the milestone DESCRIPTION** naming what moved it and which gate found it — milestones
  take no comments, so the description is the log.
- Daily report: `npm run board:report [-- --post --issue=20]`. Issue #20 holds one comment per edition.
- Template `.github/ISSUE_TEMPLATE/backlog-row.yml` requires three fields: acceptance as a COMMAND, the
  region, and the open-check.

`docs/backlog.md` contradicts itself — it says a closed row is deleted and keeps them struck through — so
it cannot be read as a task list. Filed as issue #19 rather than resolved. See
[[verify-open-against-unmerged-branches]].
