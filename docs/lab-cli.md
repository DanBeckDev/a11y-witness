# The lab and fleet command line

Every long-running operation in this project — capture, export, training, calibration, the gates — runs on
one of two machines that are not this one: the **lab** (holds the corpus, the venv and the weights) and the
**fleet** (twelve Windows boxes that drive NVDA). This is the reference for reaching both.

**CLAUDE.md documents a command beside the problem it solves**, which is more useful than an index and is
where you should read first. This file is the other half: the complete surface, the parameters, and what
each command refuses. Nothing here is a second copy of a behaviour — where a command can describe itself,
this file tells you to ask it rather than restating an answer that could drift.

## The one rule

**There is no shell.** `ssh root@…`, `pct exec` and `scp` are not how this is operated, and were the source
of the four capture shards that ran against `--worker=http://:8765` for 29 minutes. A job is a **name** from
a fixed catalogue, dispatched with fixed argv that never goes through a shell, supervised by systemd, and
readable afterwards whether or not your connection survived. See ADR 0013.

That constraint is what every command below is shaped by: the things you would reach for a shell to do —
start something, watch it, read its output, fetch its report, stop it, clean up after it — each have a
command, because any one of them missing sends you back to the shell.

---

## Run something on the lab

```bash
npm run lab:job -- -e job=<name> [-e <param>=<value> …] [-e ref=<git-ref>]
npm run lab:job                                  # no job: refuses, and names every one it has
npm run lab:job -- -e job=<name> -e describe=1   # what this job runs, and what it takes
```

`-e ref=` runs the job at a named commit. It is **refused before anything expensive starts** if the ref is
not on `origin`, because the lab fetches from there — and `run-job.yml` refuses to run at a commit other
than the one asked for, since a job quietly running four commits behind reports success for code you did
not ask for.

### Parameters

A job takes only the parameters its own command reads, and the gate derives that from the command rather
than from a list beside it. **Ask the job:**

```bash
$ npm run lab:job -- -e job=capture-only -e describe=1
capture-only — reads only; REQUIRES only. Budget 3600s.
Runs /usr/bin/npm run training:capture -- --only={{ only }}
```

The published per-job names are `only`, `out`, `role`, `shard`, `model`, `worker` and `sample`. Two apply
to **every** job and so sit outside that check: `-e ref=` and `-e describe=1`. Two refusals follow from the
derivation, and both replace a silence:

| you did | what used to happen | what happens now |
|---|---|---|
| passed a parameter the job ignores | Ansible discarded it without a word, the job ran its default, and you believed your value was applied | refused, naming what the job does read |
| omitted one the job cannot run without | it rendered as an empty string — `capture-only` with an empty `--only=` captures the **whole corpus** | refused, naming the parameter |

Values are **enums and names, never paths**: `-e out=candidate` resolves against a fixed root and
`-e worker=` is a name from `inventory.yml` turned into an address, so `runs/../../etc/cron.d/x` is
*inexpressible* rather than rejected. `ProtectSystem=strict` enforces the same thing at the kernel.

**A job of a given name is refused while one is running** — the unit name is the lock, and it holds against
any other route to the box, which an in-process flag could not.

### The catalogue

36 jobs. `npm run lab:job` with no arguments prints the current list; these are the groups.

| | |
|---|---|
| **capture** | `capture`, `capture-only`, `capture-real-pages`, `capture-acceptance`, `capture-acceptance-2`, `generate-acceptance` |
| **export** | `export`, `export-acceptance`, `export-test`, `build-realism` |
| **train and promote** | `train`, `retrain`, `promote`, `promote-diff`, `everything` |
| **gates** | `release-gate`, `rules-gate`, `rules-coverage`, `rules-real-pages`, `rules-real-pages-update`, `check-signals`, `stability`, `acceptance`, `acceptance-shipped`, `acceptance-shipped-copy`, `python-tests` |
| **audits** | `grants-audit`, `applicability-audit`, `container-exits`, `starvation`, `shortcuts`, `shortcuts-baseline`, `false-positives`, `sweep` |
| **diagnostics** | `inventory`, `evidence-check` |

---

## Watch it, read it, stop it

```bash
npm run lab:status                      # every a11y-job-* unit and its state
npm run lab:status -- -e job=<name>     # systemd's view + the journal + the run's own progress file
npm run lab:log    -- -e job=<name>     # the job's OWN OUTPUT, unwrapped — bytes, not YAML
npm run lab:fetch  -- -e artifact=<name> [-e out=<model>]   # a report, as a file
npm run lab:stop   -- -e job=<name>     # end one deliberately; reports what it discards first
npm run lab:reset  [-e ref=<git-ref>] [-e remove=<path>]    # unblock a pull the lab's own output blocks
```

**`lab:status` is the authoritative source, and hand-rolling `journalctl` instead of running it is itself a
defect source** — three of the six misreads recorded in CLAUDE.md came from exactly that. It bounds the
journal by `InvocationID`, so it shows **one run** rather than the unit's whole history; a hand-written
`--since` window spans two runs and hands you the previous one's verdict.

**`lab:log` is for output you need to read rather than scan.** `lab:status` shows the journal through
Ansible's `debug`, which wraps at ~90 characters and re-quotes as YAML, so a table, a transcript or a
threshold sweep arrives as fragments.

**`lab:fetch` artifacts** are a fixed list, for the same containment reason as job parameters:
`abstention-sweep`, `acceptance-records`, `acceptance-report`, `capture-progress`, `false-positives`,
`grants-audit`, `promoted-acceptance-report`, `promoted-training-report`, `promoted-weights`,
`shipped-acceptance`, `shortcuts-baseline`, `training-report`.

**`lab:stop` refuses a unit that is not running** and names the state it found instead — "it was already
finished" and "I stopped your job" are different outcomes. It exists because the unit name is the lock, so
`lab:job` refuses a second job of that name, and until it was written the only way out was `systemctl stop`
over ssh: the exact hole ADR 0013 closed.

**`lab:reset` discards only what `origin` already has.** The lab writes tracked files (promoted weights, a
shortcuts baseline), which dirty the checkout and block the next `git pull`. Anything it will not discard
it **reports** rather than aborting on, and `-e remove=<path>` is the deliberate escape hatch.

---

## Run several in order

```bash
npm run lab:pipeline -- --list
npm run lab:pipeline -- --pipeline=<name> [--ref=<git-ref>] [--only=<case-ids>]
```

| pipeline | fleet? | what |
|---|---|---|
| `gates` | no | score every gate against the corpus already on disk — minutes |
| `recalibrate` | no | re-derive and re-gate the model from the dataset on disk — no capture, no export |
| `verify` | yes | capture one subtype (`--only=`) and re-run the audits that would see the change |
| `real-pages` | yes | recapture the real-page corpus and prove no conformant page gained a finding |
| `corpus` | yes | recapture the synthetic corpus, then score the rule layer against it |
| `candidate` | yes | re-export both corpora under the current parse, train, audit, promote |
| `full` | yes | corpus, model and gates in one run — the whole thing, proven together |

The **order** is the thing this adds; every stage already existed and was supervised, but the sequence lived
in somebody's head. Retyped by hand it produced a fleet deployed at `main` while the lab ran a branch, four
boxes rebooted for an unpushed ref, and three jobs run four commits behind.

- **One ref, resolved once and given to both halves.** `fleet:deploy` and `lab:job` default independently,
  which is exactly how they came to be on different commits — failing with a hash mismatch that reads like
  a corrupted checkout. It is refused up front if it is not on `origin`.
- **It stops at the first failing stage and names what did not run.** A pipeline that continues past a
  failed gate produces a number that looks exactly like a good one.
- **`--only=` reaches the stage that reads it and no other.** Forwarding it to every stage is the same
  defect as a parameter a job silently ignores.

`verify` is the modular path: fix something, capture only the cases it affects, re-run the audits that
could see the change. It shares its mechanics — and its captures, which are cache-keyed identically — with
the full run, so nothing it produces is thrown away when you commit to `full`.

---

## The fleet

```bash
npm run fleet:status                    # what every box is doing, right now
npm run fleet:deploy                    # pull + install + restart + PROVE it
npm run fleet:provision [--serial=0]    # the ROLE: NVDA, the Edge pin, policies, the provision stamp
npm run worker:code                     # each worker's /health.code vs this checkout
eval "$(npm run --silent fleet:env)"    # A11Y_WORKERS from inventory.yml
npm run fleet:sleep / fleet:wake / fleet:tailscale / fleet:normalise / fleet:discover
```

The fleet is defined **once**, in `inventory.yml`. Three things are worth knowing before you type any of
these, and each has cost a run:

- **`fleet:provision` must run across the WHOLE fleet.** `provisionRevision` is a capture cache key *and* a
  `MUST_MATCH` consistency field, so a box provisioned alone gets a stamp its peers lack, the fleet reads
  INCONSISTENT, and every capture refuses to start. `--serial=0` is the normal way to converge one:
  10 m 07 s across five boxes against 26 minutes serial. Use `--limit` only to **repair** a box back to the
  stamp its peers already carry.
- **`fleet:deploy` is for bare metal; `worker:deploy` is for local UTM VMs.** They are not
  interchangeable — `worker:deploy` is `utmctl file push`, takes a VM UUID rather than a host, and fails
  immediately off macOS.
- **`fleet:status` finds the fault that produces zero failures.** A degraded guest's own retry absorbs
  every recovery, so `failures` stays 0 while that box runs at three times its neighbours' cost.

A capture **refuses a fleet that is not running this checkout**, at both capture entry points.
`--allow-stale-workers` overrides it and says so in the output rather than passing quietly.

---

## A flag a command does not read is refused, not ignored

Every CLI here parses argv by looking for the flags it knows, so anything else is dropped without a word
and the command runs its default. This repo has paid for that twice — a blocker's own message told the
reader to run `--write-baseline` when the flag is `--update-baseline`, and `--only=route-title-stale`
covered 1 of that family's 7 cases. Neither produced an error; both produced a plausible wrong answer.

```
$ npm run lab:pipeline -- --pipeline=gates --refs=main
  npm run lab:pipeline: unknown flag --refs — did you mean --ref?
  It takes: --list --only --pipeline --ref
  Refusing rather than ignoring it: an ignored flag runs the default and reports success.
```

Guarded so far — the five where an ignored flag has a measured cost:
`training:capture`, `lab:pipeline`, `promote:model`, `training:check-signals`, `training:repeat`.
`promote:model` is the sharpest of them: a mistyped `--dry-run` **promotes**.

The rest are listed in `cli-flags.test.ts` as `UNGUARDED`, **a list that may only shrink** — a new CLI
that is neither guarded nor on it fails that test, so the gap stays countable rather than invisible.

## Exit codes and what refuses what

`lab:job`, `lab:status`, `lab:log`, `lab:fetch`, `lab:stop` and `lab:reset` are Ansible playbooks: **0** the
play succeeded, **2** a task failed — which includes every refusal above. `lab:pipeline` exits **0** on a
clean run, **2** on a refused or failed stage, and names the stage.

**Never pipe a command whose exit status you intend to read.** `npm run lab:pipeline … | tail` reports
`tail`'s status, and a real `ANSIBLE_EXIT=2` has read as success here twice. Redirect to a file, then read
both the file and the status:

```bash
npm run lab:pipeline -- --pipeline=gates > /tmp/gates.log 2>&1; echo "EXIT=$?"
```

And **read the echoed value** — appending `; echo "EXIT=$?"` makes the compound command's status the
echo's, which is always 0. Measured 2026-08-25: a pipeline failed at stage 5 and the wrapper reported the
run as exit 0, because the shell's last statement had succeeded.

## See also

- [`ADR 0013`](adr/0013-lab-job-control.md) — why named jobs and not a shell, an HTTP API, or a job queue
- [`ADR 0012`](adr/0012-control-plane-split.md) — the credential split, and why exactly one machine can drive both halves
- [`packages/worker-fleet/ansible/README.md`](../packages/worker-fleet/ansible/README.md) — why SSH and not WinRM, and the two Windows gotchas
- [`CLAUDE.md`](../CLAUDE.md) — every command in the context of the problem it solves
