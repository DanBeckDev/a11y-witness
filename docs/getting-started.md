# Getting started

From nothing to your first report.

**Time:** about 5 minutes if you already have a worker. Otherwise the worker is the long
pole — roughly 20 minutes on a Windows machine you own, or 1.5–2 hours to build a VM from
scratch on a Mac, nearly all of it downloading Windows.

## The thing to understand first

There are two halves, and only one of them runs on your machine:

- **The control plane** — the CLI, the judge, the report. Runs anywhere Node runs.
- **A capture worker** — a Windows machine running NVDA, which this tool drives through
  the page.

You cannot skip the worker. Screen readers are operating-system-bound desktop
applications, not libraries: NVDA needs a real interactive Windows desktop, and VoiceOver
cannot be containerised at all. There is no Docker image that runs this whole product, and
anything claiming to test "the screen reader experience" without one is testing the DOM.
Rationale in [`adr/0001-capture-architecture.md`](./adr/0001-capture-architecture.md).

So: set up the control plane, get a worker, run it.

## 1. Install the control plane

```bash
git clone https://github.com/DanBeckDev/a11y-witness.git
cd a11y-witness
npm install
```

Node 20 or newer.

The rule-based (axe-core) layer is **optional** and not installed by this. Add it only if
you want it and do not already run axe elsewhere — it pulls ~536 MB of Chromium:

```bash
npm install playwright @axe-core/playwright && npx playwright install chromium
```

If you already run axe in your own pipeline, skip that and pass your results in later with
`--axe-results ./axe.json` instead.

## 2. Set up the judge

**There is no step here.** The judge is this project's own trained scorer, which ships in
the repo — `JUDGE_BACKEND` defaults to `local`, so there is nothing to log into, no API key,
and no per-run cost. Skip to step 3.

> This section used to say "by default it uses your local **Codex** login" and open with
> `codex login`. That default was flipped on 2026-08-04, and the instruction survived here
> for months — so a new user's very first action was authenticating against a rented model
> the tool does not use. `README.md` was corrected; this file and `METHODOLOGY.md` were not.
> A remedy that reaches one of several documents is the same defect as one that reaches one
> of several call sites, and `judge-backend-default.test.ts` now checks every document that
> makes the claim rather than just the README.

The rented backends remain available, for **comparison only** — they are never the default,
and the trained scorer is what the GitHub Action ships:

```bash
export JUDGE_BACKEND=anthropic   # plus ANTHROPIC_API_KEY
export JUDGE_BACKEND=openai      # plus JUDGE_BASE_URL — hosted OpenAI, or llama.cpp/vLLM/Ollama
export JUDGE_BACKEND=codex       # your local Codex login
```

## 3. Get a worker

Pick the route that matches what you have.

### Route A — a Mac, and no Windows machine

For a single machine, this remains the right route. **If you have or are setting up more than
one worker, prefer a declared fleet instead** — see [`control-plane-proxmox.md`](./control-plane-proxmox.md);
the CLI already reads that ahead of any local VM, so nothing below is used once a fleet exists.

Builds a Windows 11 ARM64 VM locally, unattended. One-off host prerequisites:

```bash
brew install qemu cdrtools socat wimlib aria2 cabextract
brew install --cask utm
```

**These scripts print a DEPRECATION warning, and here is what it does and does not mean.** UTM was this
project's own testing path and its capture fleet is now ten bare-metal Windows machines, so nothing we
capture comes from a VM any more — the warning is telling you that you are off the path this project
exercises daily. **It is not telling you the scripts are broken.** For a single contributor on a Mac with
no Windows hardware, a local VM is still a real option, and this is still how you build one. If you would
rather not, the two supported alternatives are a Windows machine you already own (20 minutes, the section
above) or the GitHub Action, which needs no worker of your own at all.

Then:

```bash
./packages/worker-fleet/src/local-worker/fetch-windows-iso.sh          # official Win11 ARM64 ISO (~10 GB download)
./packages/worker-fleet/src/local-worker/build-vm.sh <the-iso>         # unattend answer file + ARM64 drivers
./packages/worker-fleet/src/local-worker/create-utm-vm.sh <the-iso>    # creates and starts the VM
```

It installs Windows, logs in, installs NVDA and starts the worker with no clicking. Budget
1.5–2 hours, almost all of it the download. Check it came up:

```bash
npm run worker:ctl -- status
# health:  includes deployed code plus worker-reported NVDA/Edge/runtime versions
```

Full walkthrough, including what to do when a step fails:
[`local-worker-vm.md`](./local-worker-vm.md).

### Route B — you already have a Windows machine

On that machine, in an **elevated** PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
irm https://raw.githubusercontent.com/DanBeckDev/a11y-witness/main/packages/worker-fleet/src/provisioning/bootstrap-windows-worker.ps1 | iex
```

It installs Node, Git and NVDA, configures the interactive session, and starts the worker
as a scheduled task. **It reboots at the end** — that is deliberate, not a failure: a
freshly provisioned machine answers `/health` but captures nothing until it has restarted
once. It comes back on its own about a minute later.

Then, from your own machine:

```bash
export A11Y_WORKER=http://<that-machine>:8765
curl $A11Y_WORKER/health
```

### Route C — no machine to spare

Real NVDA runs on a GitHub-hosted Windows runner. See
[`.github/workflows/capture-regression.yml`](../.github/workflows/capture-regression.yml)
for a working example to copy.

## 4. Check you are ready

```bash
npm run doctor
```

**A stopped worker is not a problem.** Runs start what they need and stop it again, so
`doctor` reporting `3 worker(s), all stopped` is a READY state. Follow its `next` line rather
than trying to get everything running first.

**If you changed anything under `packages/nvda-worker/src/`, check the workers are running it:**

```bash
npm run worker:code    # each worker's /health.code vs this checkout; exits 1 if any is stale
```

Deploying is push-then-restart and both halves can fail silently — a `utmctl exec` restart does
nothing while the guest agent is still settling, and two workers once served old code for an hour
that way. Push, **reboot the guest** (`worker-ctl.sh stop && up`), then run the check above. It
asks over HTTP, so unlike reading the guest's file hash it shares no failure mode with the
deploy.

One command for the whole prerequisite chain — VM, worker, page server, judge backend, and
any run left mid-flight. Anything failing prints the exact command that fixes it. Run this
before anything else when something looks wrong; it is faster than reasoning from symptoms,
and the symptoms mislead (see the table below).

## 5. Your first report

```bash
npm run witness -- https://example.com --task "Read and understand this page"
```

On Route A you can leave `A11Y_WORKER` unset — the run finds the local VM, starts it, and
puts it back exactly as it found it afterwards.

Expect roughly a minute: a real screen reader is reading a real page. You should see:

```
Scanning https://example.com (real screen reader) ...
Captured 4 announcements; judging ...

a11y-witness report
===================
URL:   https://example.com
Task:  Read and understand this page

-- Rule-based layer (axe-core): contrast, colour, ARIA, parsing --
not run. Visual criteria are unchecked, not clean.

-- Lived-experience layer (NVDA + AI judge): 4 announcements --
Task completable: yes (overall confidence 0.96)
1 finding(s):
  Navigate — can the user move through the page?
    [MODERATE] 2.4.4 Link Purpose (In Context) (A)  (confidence 0.94)
       The link text "Learn more" does not clearly convey its destination or purpose in context.
       evidence: 4. link, Learn more
```

That is a working install. `--json` gives you the full transcript alongside the findings.

## 6. When the first run does not work

| what you see | what it means |
|---|---|
| `fetch failed` / `ECONNREFUSED` | The worker is not reachable. Check `A11Y_WORKER`, and that the worker machine is up and its firewall allows 8765 |
| `WARNING: 0 announcements captured` | The worker is running but NVDA produced no speech. **This is a worker problem, not a clean page.** Re-run with `--debug` and read `documentReady` first |
| `Local worker VM ... did not become healthy` | Route A: the VM booted but the worker task did not start. `npm run worker:ctl -- status` |
| `NVDA not installed` | Almost always a **version mismatch**, not a missing install |
| `nvda.start failed: NVDA is not supported` | You ran the capture in **session 0** — `utmctl exec` and SSH both land there and cannot drive NVDA. Use a scheduled task with `LogonType Interactive` |
| VM state `unknown`, worker unreachable, but the bundle is there | **UTM is not running.** `utmctl` is a client for the app, not a daemon; `worker-ctl.sh` launches it for you. `pgrep -x UTM` to confirm |
| It worked a minute ago and now nothing responds | Something else is driving the worker. There is **one** VM and **one** NVDA here, so another shell, agent, or a `capture-check` run restarts it out from under you. `worker-ctl.sh status` before assuming breakage |
| Findings that look wrong | Check the `evidence` line against the transcript in `--json`. If the evidence is not in the transcript, that is a bug here — please report it |

On a Windows worker, `packages/worker-fleet/src/provisioning/diagnose-nvda-worker.ps1` checks six layers and prints
PASS/FAIL with the fix for each. The error-string-to-real-cause table is in
[`nvda-worker-runbook.md`](./nvda-worker-runbook.md) — the messages are misleading often
enough that the table is faster than reasoning from first principles.

## Next

- **Reading the output well** — the "Using it" section of the [README](../README.md):
  choosing a task, checking evidence, what the confidence numbers do and do not mean.
- **Testing behaviour, not just reading** — add `--probe-forms` to submit a form with no
  valid input and record whether the error is announced at all.
- **Keeping the VM cheap** — `worker-ctl.sh pause` between runs; `idle-pause 15` to do it
  automatically.
- **Making it faster** — add a second worker with
  `packages/worker-fleet/src/local-worker/clone-worker.sh`, then just run as normal: with no `A11Y_WORKER` set,
  a run uses as many local workers as the host can hold and puts each one back afterwards.
  Measured 1.90x on two workers, 2.36x on three *on a quiet host* — but a worker VM costs ~7 GB
  of host memory, so three do not fit on a 36 GB Mac that is also your desktop, and
  over-committing causes failed captures rather than just slow ones. `npm run doctor` prints how
  many will fit. See [`local-worker-vm.md`](./local-worker-vm.md).
