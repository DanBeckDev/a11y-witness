---
name: avoid-agent-overspawn
description: "Don't default to spawning multiple parallel subagents for large research/audit tasks — do the work directly, or ask first"
metadata:
  type: feedback
---

Don't reach for the Agent tool (parallel forks/subagents) as the default way to handle a large research or audit task — do the work directly, sequentially, in-session, unless the user has already asked for multi-agent parallelism.

**Why:** Dispatched 4 parallel background agents at once to audit `docs/known-gaps.md`'s 37 sections against source (each running many grep/read/git-log calls). The user had to interrupt and stop all four, then said: "agents use too much session use. how do we stop this from happening again?" — a direct correction about session-usage cost, not about correctness.

**How to apply:** When a task naturally splits into independent chunks (e.g., N doc sections to verify, N files to audit), prefer doing it directly myself rather than spawning parallel Agent-tool calls — even if an earlier pattern in the same session (e.g., peer-assigned units elsewhere in this project) used forking successfully for similar-looking work. A prior success with forking is not a standing license to default to it. If a task is genuinely large enough that parallelism seems valuable, ask the user first before dispatching multiple agents, rather than launching them and finding out afterward that it was too much. This is a general rule for this project, not specific to the known-gaps unit.
