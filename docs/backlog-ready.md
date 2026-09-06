# Ready queue — **RETIRED. DO NOT READ THIS PAGE FOR WHAT IS OPEN.**

> **THE QUEUE MOVED TO GITHUB ISSUES AND THIS FILE DID NOT GO WITH IT.** The board's Ready column carried
> **eleven rows** on 2026-09-06 while this page listed one, then none — so a reader who trusted this file
> concluded there was no work to pull. **A dead copy that still answers questions is worse than two copies
> that visibly disagree.**

**What is open, and what is ready to start:** <https://github.com/DanBeckDev/a11y-witness/issues> and
Project 2, whose **Ready** column is what the dispatcher pulls from.

**The rows are gone from this page rather than left under a warning**, because a banner does not stop
someone scrolling past it — that is how this page came to be trusted after it had stopped being true.
This file is kept only as a signpost, so an old link leads somewhere that explains itself.

## Where each part of it went

| what this page held | where it is now |
|---|---|
| The ready rows | GitHub Issues, labelled `ready`, in Project 2's **Ready** column |
| The three fields every row must carry — acceptance as a command, region, open-check | `.github/ISSUE_TEMPLATE/backlog-row.yml`, which **requires** them rather than asking. `backlog-ready.test.ts` guards that, and states the gap it cannot close |
| The region-diff claim mechanism, and why a branch NAME cannot be the key | the same template, in the open-check field's own guidance |
| **A gate that reads `runs/` is not yours to report** | [`CLAUDE.md`](../CLAUDE.md) — it existed **nowhere else**, so retiring this page would have deleted a live rule. It is not left here as well: a rule stated twice is what the move was cleaning up after |

`docs/backlog.md` and `docs/known-gaps.md` remain the **record** of lessons. They are not the tracker and
have not been since the move.
