# Migrating this organisation to a new machine

This is the runbook for the day this Mac is actually lost, or is deliberately retired. `docs/roles/README.md`
answers "can the organisation be reconstituted from the repo alone" for the git-visible half; this file
answers the harder question — what has to move BY HAND, in what order, and what must never be attempted
while a capture is running.

## What moves, and where

| what | from | to | how |
|---|---|---|---|
| Source, tests, docs, role files, memory | this Mac's checkout | the new machine | `git clone`, or `git remote add` + `git fetch` if the new machine already has a stale clone |
| **Claude Code's own memory for each agent** | `~/.claude/projects/-Users-<user>-Documents-repos-personal-a11y-witness/` on this Mac | the equivalent path under `~/.claude/projects/` on the new machine | see "The project-key rename" below — this is the one step that is NOT a plain copy |
| The fleet SSH key, the lab's `a11y-pve` key | this Mac's filesystem | the new machine's filesystem | out of band, by whoever holds them today — see `packages/control/ansible/README.md`'s "Issuing a new operator's credentials", and note that MOVING a key to a new machine is not the same operation as issuing a new one: prefer generating a fresh keypair for the new machine and revoking the old, per that section's step 4, unless the old machine is being destroyed in the same act as the move |
| The authoritative training/real-page corpus | `a11y-lab` (CT 121) | unchanged — the lab is a separate host from whichever Mac is the control plane | nothing to migrate here UNLESS the lab itself is also moving, which this runbook does not cover |
| The daily board report's schedule | a launchd agent on this Mac (`bash scripts/install-board-report.sh`) | GitHub Actions, per `ceo`'s ruling — see "The board report job" below | nothing to migrate once the Action lands; kept as a row here until it does |
| `docs/board/reported.json` | tracked in the repo | tracked in the repo | moves automatically with `git clone` — nothing to do |
| `runs/` in the primary checkout | this Mac's local copy | re-synced on the new machine | `runs/` is gitignored and a LOCAL COPY everywhere, including the primary checkout today — the new machine starts with none and that is normal; `npm run lab:inventory` says how stale a copy is once one exists. The authoritative corpus never moved (see row above) |
| **`packages/control/ansible/inventory.yml`** | this Mac's filesystem, gitignored — restored from the secrets store, never committed | the new machine's filesystem, same way | Posture change, `ceo`-ruled (issue #54): real fleet/lab/control-plane addresses no longer live in git history going forward. `inventory.example.yml` is the committed, syntax-checkable stand-in (same worker names and group structure, placeholder addresses) — a fresh clone gets an honest absence, which the code already handles (37 of 40 readers funnel through two absence-tolerant functions returning `[]` on ENOENT). Same category as the two SSH keys above: describe it, restore it out of band, never assume `git clone` alone brings it |

## The project-key rename

Claude Code keys each project's memory directory by the **absolute path** of the working directory a
session was launched from — this repo's own memory lived at
`~/.claude/projects/-Users-danielbeck-Documents-repos-personal-a11y-witness/memory/`, where the directory
name is a mechanical transform of `/Users/danielbeck/Documents/repos/personal/a11y-witness`.

**This means the key is almost certainly wrong on a new machine before anything is done about it.** A
different username, a different home directory layout, or simply cloning to a differently-named directory
all change the absolute path, and the memory directory a fresh Claude Code session reads from is a
directory that does not yet exist there — an agent resuming on the new machine sees a clean slate,
correctly, and has no way to know a populated one exists elsewhere under the old key.

**One finding from writing this file, not previously documented:** the memory at that path was not
`worker-config`'s alone. Several entries read from `orchestrator`'s or `ceo`'s own first-person perspective
("I own fleet, lab, `runs/`..."), because the key is derived from the WORKING DIRECTORY, not from which
agent identity a session was told to adopt. Any Claude Code session launched from the primary checkout's
path — regardless of which role it was briefed into — reads and writes the same memory directory. This is
why `docs/roles/memory/` (migrated separately, into the repo, see its own `MEMORY.md`) is the durable
artefact and the live `~/.claude` directory is not: the repo copy survives a machine loss and a role
reassignment; the live directory survives neither.

**What to actually do, in order:**

1. On the new machine, clone the repo to the path you intend to keep using (or, if reusing an old stale
   clone, note its path — the key is derived from THAT path, not from where you eventually intend to move
   it).
2. If the new machine's absolute path differs from the old Mac's (near-certain — different username at
   minimum), the live `~/.claude` memory does not follow automatically. Two options, and prefer the first:
   - **Read `docs/roles/memory/` in the repo.** It is the durable, git-tracked snapshot as of the migration
     that wrote it, and it needs no path-matching at all — this is the point of having migrated it.
   - **Copy the old machine's memory directory by hand**, from its exact old path to the new machine's
     `~/.claude/projects/<computed-key-for-the-new-checkout-path>/memory/`, if you specifically need memory
     newer than the last `docs/roles/memory/` commit. Compute the new key the same way Claude Code does —
     the absolute checkout path with `/` replaced by `-` — rather than guessing; a mismatched key silently
     produces an empty memory directory with no error.
3. Do not delete the old machine's `~/.claude` directory until the new machine's agents have confirmed
   they can read what they need — a memory directory, once gone, is gone; `docs/roles/memory/` is the only
   copy of it that was ever committed anywhere.

## Bring-up order — RESUME FIRST

`docs/roles/README.md`'s own bring-up order (`orchestrator` → `dispatcher` → workers, `ceo` and
`product-manager` outside the sequence) is for standing the organisation up from **nothing** — a truly
fresh clone with no prior session history. A migration is different: prior session history usually exists
and resuming it is cheaper and more complete than re-deriving it from role files alone.

**So, per agent, in this order:**

1. **Try to resume the agent's own session first**, if the harness this machine runs supports resuming
   from a transcript (Claude Code's `--resume`/`--continue`, or the equivalent). A resumed session carries
   everything a role file cannot: the specific units it was mid-way through, corrections a peer gave it
   this session, context that never made it into any file. This is strictly more complete than a fresh
   start when it works.
2. **If resume fails** (transcript not carried over, harness mismatch, corrupted state) **fall back to the
   role file**, per `docs/roles/README.md`'s first-message table, PLUS `docs/roles/memory/MEMORY.md` — this
   is exactly what `scripts/reconstitution-drill.mjs` composes automatically; run it rather than
   re-assembling the message by hand.
3. Bring up `orchestrator` before `dispatcher` before workers, matching `docs/roles/README.md`'s reasoning
   — nothing else can be usefully briefed against real fleet/lab state until the driver exists, whether
   that agent was resumed or freshly started.

**A session resumed from a transcript and a session freshly started from a role file are not
interchangeable states to skip past** — the drill below exists specifically to prove the fallback path
(step 2) actually produces a working agent, since the resume path (step 1) is not something a scheduled
drill can safely rehearse without a second machine already in place.

## The board report job — the systemd variant

**RESOLVED by `ceo`, reversing this file's own earlier position.** This section used to record a real
disagreement between `docs/roles/README.md`'s table (launchd, deliberately, because a GitHub Actions
runner sees only `origin/main` and cannot catch a merged-but-unpushed hold) and
`docs/roles/memory/org-shape-second-orchestrator.md`'s recorded board decision that the report moves to
GitHub Actions once push-everything is enforced. `ceo` ruled for the second: **"push-everything means
nothing is unpushed, so the runner sees everything"** — the runner's blind spot was the local-checkout
gap, and that gap is what the push-per-commit rule closes. `docs/roles/README.md` carries the ruling and
its reasoning now; this file no longer defers it.

**What that means for THIS section.** A GitHub Actions runner needs no scheduler on any control-plane
machine at all — it is Linux and always-on by construction, which is a stronger answer than "the systemd
equivalent of the launchd job" ever was. The systemd recipe below is kept anyway, for the case the ruling
does not cover: **a job that has no GitHub-hosted equivalent** (nothing here does yet, but the migration
runbook should not assume that stays true), or a control-plane machine that needs to run something
locally regardless of where the corpus lives. Read it as the general "how to schedule a job on this
machine's successor" reference, not as the board report's own answer anymore.

```ini
# /etc/systemd/system/a11y-witness-board-report.service
[Unit]
Description=a11y-witness daily board report
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/path/to/a11y-witness
ExecStart=/usr/bin/npm run board:report -- --post --issue=20
User=<the operator account>
```

```ini
# /etc/systemd/system/a11y-witness-board-report.timer
[Unit]
Description=Run the a11y-witness board report daily at 08:00 Europe/London

[Timer]
OnCalendar=*-*-* 08:00:00 Europe/London
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now a11y-witness-board-report.timer
systemctl list-timers a11y-witness-board-report.timer   # confirm the next scheduled run
```

`Persistent=true` mirrors launchd's own catch-up behaviour (a missed run — machine off at 08:00 — fires
once at next boot rather than being silently skipped), which is the same property
`docs/roles/README.md`'s state table calls out for the existing job.

## The freeze rule — never migrate during a capture

**Do not begin any step of this runbook while `npm run fleet:status` shows a worker `busy`, or while
`npm run lab:status` shows a job running.** Two independent reasons, both already established elsewhere in
this repo rather than invented for this file:

- **A capture in flight has no resumption of its own.** `docs/nvda-worker-runbook.md` and CLAUDE.md's
  socket-loss section both describe the lengths this project goes to so a LOST RESPONSE can be recovered —
  none of that machinery survives the control plane itself disappearing mid-request. A migration mid-capture
  does not lose one response; it can lose the whole run's ability to report back, because nothing is
  listening for the retry.
- **Credentials moving while jobs are dispatched is how a job ends up authenticated from two places at
  once.** `lab:job` and `fleet:deploy` both assume exactly one machine holds the relevant key at a time
  (ADR 0012); a migration in progress is briefly a period where that assumption may not hold, and starting
  new work into that window is how a split-brain dispatch happens.

**Concretely:** before starting a migration, run `npm run fleet:status` and `npm run lab:status` and
confirm nothing is `busy`/running. If a capture is in flight, wait for it to finish or use `npm run
lab:stop -- -e job=<name>` to end it deliberately (it reports what it discards first) rather than migrating
underneath it.

## The drill — SCHEDULED, not yet run

**This is the acceptance test for the "resume first" claim above, and per `docs/roles/README.md`'s own
rule for its sibling drill, an unexercised plan is not a verified one.** It needs a second machine (or a
VM) that this unit did not have — hence scheduled rather than run.

**The drill, as a procedure to actually carry out:**

1. Pick one worker agent (e.g. `worker-config`) and copy its live Claude Code transcript — the file(s)
   under its `~/.claude/projects/<key>/` directory — to a second machine or VM, preserving the project-key
   path structure described above (or reconstructing it correctly for that second machine's own absolute
   checkout path).
2. On the second machine, clone the repo to the checkout path that matches the key you preserved or
   reconstructed in step 1.
3. Attempt to resume the session from the copied transcript, using the harness's own resume mechanism.
4. **Ask it a lane-specific question that only its own prior session history could answer** — not something
   derivable from `docs/roles/worker-config.md` or `docs/roles/memory/` alone. For example: which specific
   unit it was mid-way through when the transcript was copied, or a correction a peer gave it earlier in
   that session that is not written into any committed file.
5. If it answers correctly, **have it complete one real unit** end to end on the second machine — commit
   included — proving the resumed session is not just conversationally coherent but actually able to work.
6. Record the result (pass, partial, or fail with what specifically broke) as a new memory entry and, if
   the drill reveals a gap in this runbook, fix the runbook rather than only the memory.

**What would make this drill fail, predicted rather than observed, so a real run has something to check
against:** the project-key path not matching exactly (see "The project-key rename" above) is the most
likely single point of failure — a resume attempt against a memory directory computed from a slightly
different absolute path finds nothing and looks exactly like a session with no history, not like an error.
