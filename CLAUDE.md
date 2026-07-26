# CLAUDE.md — a11y-witness

Guidance for Claude Code (and humans) working in this repo.

## What this is

a11y-witness drives a **real screen reader (NVDA)** through real navigation and uses an AI judge (via local Codex — no metered API) to assess the lived assistive-technology experience: the judgment-based WCAG failures that rule scanners miss. It sits **alongside** axe-core (the rule/visual layer), not instead of it. See `README.md`, `PLAN.md`, and `docs/adr/`.

## Code conventions

We follow the applicable subset of *Clean Code* (Martin). It has two halves, enforced differently.

**Mechanical — enforced by ESLint (`npm run lint`); errors block CI:**
- Small functions that do one thing at a single level of abstraction; the top-level function reads as a top-down narrative (the Stepdown Rule). Gated by `max-lines-per-function` (70), `complexity` (15), `max-depth` (3).
- Few arguments, and **no boolean flag arguments** — bundle cohesive arguments into an object instead. Gated by `max-params` (4).
- **Never swallow an error** with an empty `catch {}` — record a diagnostic or rethrow with `{ cause }`. Gated by `no-empty`. (This codebase's whole diagnostics model exists because silent catches once hid an outage.)
- `no-magic-numbers` is a non-blocking **warning**: name a number when it is not self-explanatory (timeouts, budgets, limits); HTTP status codes and slice lengths are fine inline. This matches the book's G25 ("only when the value is not already self-explanatory").

**Judgment — not machine-checkable, so honor these by hand:**
- Does the function *really* do one thing? Extracting a helper whose name merely restates its code is not progress (the book's own test).
- Comments explain **why** — intent, consequences, non-obvious domain facts (NVDA quirks, the cursor-at-end gotcha, WCAG rationale). **Keep those.** Delete only comments that restate what the code already says. The book attacks noise and bad-code-compensating comments, and explicitly endorses intent/warning comments.
- Intention-revealing names; rename freely when a better name appears.
- **Do NOT import the book's Java-OO machinery** (Abstract Factory to hide switches, class-per-noun, ArgumentMarshaler-style hierarchies). This is a small functional TS/MJS pipeline; adding class structure here is over-engineering, the opposite of "scalable." Match the surrounding functional style.

## Working on a Mac (the usual case)

Everything except capture runs natively. Capture needs a Windows worker, and there is a
scripted local one — start here: **`docs/getting-started.md`**, details in
`docs/local-worker-vm.md`.

```bash
./scripts/local-worker/worker-ctl.sh up        # start/resume the VM, wait for /health
./scripts/local-worker/worker-ctl.sh status    # state, host cost, health
./scripts/local-worker/worker-ctl.sh pause     # between runs; resume is under a second
npm run witness -- https://example.com --task "..."   # no A11Y_WORKER needed
```

With no `A11Y_WORKER` set the run finds the local VM, starts it, and **puts it back as it
found it** — so a VM you started yourself is left running. `--after stop|pause|leave`
overrides. `--no-axe` skips the optional rule layer; `--axe-results file.json` imports one you
already ran.

**Changing `capture-core.mjs` means deploying to the guest.** Push, verify the hash, restart:

```bash
UUID=$(utmctl list | awk '$3=="a11y-worker"{print $1}')
utmctl file push "$UUID" 'C:\Users\witness\a11y-witness\src\capture\nvda\capture-core.mjs' < src/capture/nvda/capture-core.mjs
utmctl exec "$UUID" --cmd powershell.exe -NoProfile -Command 'Stop-ScheduledTask -TaskName a11ysrv; Get-Process node -EA SilentlyContinue | Stop-Process -Force; Start-Sleep 2; Start-ScheduledTask -TaskName a11ysrv'
```

Always hash-check both sides. A stale worker running old code looks exactly like a logic bug
and will waste an hour.

**`utmctl exec` and SSH land in session 0 and cannot run a capture.** Guidepup needs an
interactive desktop and reports its absence as `nvda.start failed: NVDA is not supported`,
which reads like a broken install and is not one. Run captures through a scheduled task with
`LogonType Interactive` — see the runbook.

## Verifying changes (there are no unit tests)

Verification is layered; pick the layers your change touches:
- `npm run lint` and `npm run typecheck` — must pass. **CI gates on both.**
- `npm run eval [-- <substring>]` — judge quality against 34 labelled fixtures. Needs a local Codex login, so it **cannot run in CI**; run it when you touch the judge, prompts, criteria, or fixtures. Do **not** quote its numbers as a headline: `docs/METHODOLOGY.md` records that the guards were tuned against these cases, scoring is single-run, and there is no expert baseline yet. Report with those caveats or not at all.
- **`src/capture/nvda/capture-core.mjs` only runs against NVDA on the Windows VM** — it has no local test. After changing it, deploy (above) and run `src/capture/nvda/capture-check.mjs` **in the interactive session**, then `scripts/bench-capture.mjs` if you touched timing. capture-check refuses to run while the worker is serving, because NVDA is one machine-wide resource and two drivers stop each other's screen reader; stop the worker first and **restart it afterwards**. The VM capture is its test; the book's own rule is "refactor under test."
- **Count-based checks cannot see content rot — assert what was heard, not how much.** capture-check now gates on probe *values* (`disclosure-good` must reach `expanded`, `disclosure-bad` must stay `collapsed`) and on the read-through still carrying roles, because both lessons were learned the hard way. A readiness gate once overwrote the first line of every page with the document title, deleting the h1's `"heading, level 1, ..."` announcement everywhere: `"heading, level N"` phrases fell from 105 to 15 across 90 captures and **every check stayed green**, because the phrase count had not moved. If you change capture, compare evidence quality against a previous run, not just line counts.
- `npm run training:check-signals` — proves every dataset `badSignal` fires on the bad page and stays silent on the good one, against captures already on disk (no worker needed). Run it after ANY change to a probe's output shape: a probe and its signal are coupled, and 8 cases once went silently blind when a probe changed. `npm run training:status` reports a long capture run; `--resume` picks up where one stopped.
- **Worker broken? Don't debug from first principles** — `docs/nvda-worker-runbook.md` has the error-string → real-cause table (the messages are misleading: `"NVDA not installed"` usually means a version mismatch, not a missing install), and `scripts/diagnose-nvda-worker.ps1` applies it automatically. `scripts/provision-nvda-worker.ps1` is the idempotent repair.
- **No worker to hand?** Build one: `docs/getting-started.md` (~1.5–2 h, almost all of it downloading Windows). Validating capture changes through CI is a ~10-minute loop and should be the fallback, not the habit.

## Environment facts
- ESM throughout (`"type": "module"`). `.ts` for the control plane, `.mjs` for the capture worker (it runs under plain Node on the VM).
- The judge runs via the **Codex CLI** (subscription login), never the metered Anthropic API.
- Don't manually `taskkill nvda.exe` — let Guidepup own NVDA's lifecycle, or the speech-capture channel destabilises. Killing the worker with `Stop-Process` orphans its NVDA (still holding port 6837); the next cold start recovers, but expect to see it.
- The worker keeps NVDA alive between captures (recycled every 25). `A11Y_REUSE_NVDA=0` reverts to a fresh NVDA per capture — the first thing to try if captures drift as a run progresses.
- The guest is provisioned as an **appliance**: Windows Update may install but not reboot, and Edge's background mode, startup boost and auto-updater are off. It used to reboot itself mid-run and leak Edge processes.
- A capture is ~13–19 s. A full 45-pair dataset run is ~25 min. If it is much slower, something is wrong — check `scripts/bench-capture.mjs` phase timings before optimising anything.
