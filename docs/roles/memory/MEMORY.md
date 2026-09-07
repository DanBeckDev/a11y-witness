# worker-config's accumulated memory, migrated into the repo

This is a snapshot of `worker-config`'s `~/.claude` memory directory as of 2026-09-06, moved here so it
survives losing this Mac. See `docs/roles/migrate.md` for what moved, what did not, and why. **Every
entry below is a point-in-time observation, not live state** — a file path, a number or a claim about
current behaviour may since have moved; verify against the code before treating one as fact.

**One entry was redacted rather than moved verbatim**: [`nvda-worker-vm-access.md`](nvda-worker-vm-access.md)
named a real host address, an SSH key filename and a container layout. The workflow fact survives; the
reachability material does not — see that file's own note and `docs/roles/README.md`'s "Credentials"
section for why.

- [Fleet and control-plane access (redacted)](nvda-worker-vm-access.md) — two credential domains and that the lab takes SSH DIRECTLY; the address and key name are deliberately not here.
- [Local worker VMs are deprecated](local-worker-vms-deprecated.md) — capture runs on the bare-metal fleet; the repo docs used to say otherwise.
- [Orchestrating peer sessions](orchestrating-peer-sessions.md) — partition by RESOURCE, one merge tree, why cross-cutting review does not compose.
- [The peer-session resource ban](peer-session-resource-ban.md) — the verbatim text every brief carries, and the worktree setup done once per unit.
- [Avoid agent overspawn](avoid-agent-overspawn.md) — don't default to parallel subagents for large tasks; do it directly or ask first.
- [Rank a claim only after reading it](rank-a-claim-only-after-reading-it.md) — send a hypothesis with its check named, not a mechanism reasoned rather than read.
- [Verify a peer's load-bearing claim](verify-a-peers-load-bearing-claim.md) — re-derive the one line that could cost a corpus; ask HOW a number was obtained.
- [CEO: idle workers are my failure](ceo-worker-utilisation.md) — check ListAgents every round; require a utilisation line; no idle worker while fleet-free rows exist.
- [A fix reaching the instance, not the class](a-fix-reaching-the-instance-not-the-class.md) — after any fix, sweep for the shape and pin the class with a test.
- [A number from the apparatus](a-number-from-the-apparatus.md) — a plausible number from a fixture or placeholder looks exactly like a measurement; ask where it came from.
- [Board document AI content guidelines](board-document-ai-content-guidelines.md) — the chairman's four author rules for anything presented to the board.
- [Check whether the record was superseded](check-whether-the-record-was-superseded.md) — a true-when-written comment may have been answered by a file added since; grep before quoting.
- [GitHub is the tracker](github-is-the-tracker.md) — what is open lives in GitHub Issues + Project 2, not `docs/backlog.md`.
- [Merge worktree is not a gate environment (corrected)](merge-worktree-is-not-a-gate-environment.md) — the real cause was `GIT_DIR` leaking into hook-run tests, not the worktree itself.
- [Mutation-check from a copy](mutation-check-from-a-copy.md) — copy the file aside, never `git checkout --`; a guard that passes under mutation is a guard to suspect.
- [Org shape: a second orchestrator](org-shape-second-orchestrator.md) — the worker-loop split, and the board decisions recorded alongside it.
- [Worktree resolves to the primary's dist](worktree-resolves-primary-dist.md) — a shared `node_modules` makes a worktree's own build invisible to cross-package tools.
- [Verify open against unmerged branches](verify-open-against-unmerged-branches.md) — check `origin/main` plus every unmerged `agent/*` branch, by region diff, never by branch name.
- [A reproduction names its version](a-reproduction-names-its-version.md) — what you ran, what it said, and AS OF WHICH commit or export; missing the third retracted a correct theory.
