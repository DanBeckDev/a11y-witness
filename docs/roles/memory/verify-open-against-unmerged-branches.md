---
name: verify-open-against-unmerged-branches
description: "Verified open at HEAD" cannot see finished-but-unmerged work; check origin/main PLUS every unmerged agent/* branch, by region diff.
metadata:
  type: feedback
---

Before dispatching anyone at a work item in a multi-agent repo, verify it is open against **`origin/main`
plus every unmerged local `agent/*` branch** — never HEAD alone — and derive the claim from the region
DIFF, never from a branch NAME:

```
git log --branches='agent/*' --not origin/main --oneline --source -- <region path>
git worktree list
```

**Why:** measured on a11y-witness 2026-09-06. Three of six rows seeded that morning were already addressed
by branches sitting in a review queue, and every one looked open at HEAD; three units were dispatched at
closed rows the day before. Separately, only 1 of 6 rows landed under its suggested branch name and 4 of
the 6 names never existed, so a name-keyed check reports rows unclaimed while the work is done.

**How to apply:** run it per region path before filing or briefing. Two limitations to carry rather than
drop — it only sees a fix touching the EXACT region path (a row whose fix landed in a different file reads
as unclaimed), and `git branch -r --list 'origin/agent/*'` is always empty in that repo because agent
branches are never pushed, so anything written against the remote namespace answers "clear" forever.
Distinguish "the discovery broke" from "the queue is legitimately empty" — an empty queue is the correct
end state. Related: [[github-is-the-tracker]], [[verify-a-peers-load-bearing-claim]].
