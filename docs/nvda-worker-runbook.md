# NVDA capture worker: provisioning and debugging runbook

Everything needed to stand up, verify, and repair the Windows machine that drives
real NVDA. Written for whoever (or whatever) is holding the terminal — no prior
context assumed.

Three scripts do the work; this document explains *why* each step exists, so you can
reason when reality diverges from them:

| | |
|---|---|
| `scripts/diagnose-nvda-worker.ps1` | Read-only. PASS/FAIL per layer with the fix for each. **Start here when something breaks.** |
| `scripts/provision-nvda-worker.ps1` | Set up or **repair** a worker. Idempotent — re-running it is the normal fix. |
| `scripts/bootstrap-windows-worker.ps1` | Fresh Windows → provisioned worker (Node, Git, SSH, clone, then hand off to the above). |

> **Want the worker on your own machine instead of a separate box?** See
> [`local-worker-vm.md`](./local-worker-vm.md) — NVDA runs natively on Windows ARM64,
> so a UTM VM on an Apple Silicon Mac works, and a provisioned image can be handed to
> other developers so they skip the setup entirely. That is a far better debugging loop
> than validating capture changes through CI.

Run either one remotely by copying it over and invoking it with `-File`:

```bash
scp scripts/diagnose-nvda-worker.ps1 user@worker:C:/Users/user/
ssh user@worker "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\user\diagnose-nvda-worker.ps1"
```

> **Do not pipe these scripts to `powershell -Command -`.** That mode silently
> truncated the diagnostic mid-run — every check printed, but the summary and the
> non-zero exit never executed, so it looked like a pass. A leading `<# #>` block
> comment suppresses a piped script's output entirely. Stdin piping is fine for
> short ad-hoc snippets (and is the sane way to avoid `cmd` quoting hell, since the
> default SSH shell on Windows is `cmd`) — but use `-File` for anything real, and
> check the exit code.

## Why the machine has to look like this

A screen reader is a GUI application. It needs a real desktop, a foreground browser
window, and focus. That single fact drives every constraint below, and it is why
capture cannot run in a container — see [ADR 0001](./adr/0001-capture-architecture.md).

```
control plane (any OS)                    worker (Windows, logged-on desktop)
  npm run witness ──HTTP──▶  server.mjs ──▶ capture-core.mjs
                             :8765          │
                                            ├─▶ Edge  (--app window, own profile)
                                            └─▶ NVDA  (via @guidepup/guidepup)
                                                  │
                                       speech read back over a TLS
                                       channel on 127.0.0.1:6837
```

The worker is a **scheduled task**, not a service, because a service has no desktop.
Speech is captured over NVDA's Remote Access channel — *not* from audio. The VM has
no sound device at all and this is fine; do not go hunting for audio problems.

## Provision a fresh Windows machine

Windows 11 (or Server 2022/2025), an admin account, SSH reachable, and — critically
— **that account logged in at the console**, so an interactive session exists.

Run the bootstrap; it installs the prerequisites, clones the repo, and hands off to
provisioning:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
irm https://raw.githubusercontent.com/DanBeckDev/a11y-witness/main/scripts/bootstrap-windows-worker.ps1 | iex
```

> **Do not reach for `winget` here.** On a freshly installed Windows it does not exist:
> it ships as the "App Installer" Store package, which is not registered on a new image,
> so the call dies with `'winget' is not recognized`. The bootstrap fetches the official
> ARM64 archives directly instead — and note the current Node LTS publishes **no arm64
> MSI**, only a zip, so archive extraction is the only version-agnostic route.

If the box already has Node and Git, you can skip straight to provisioning, which does
the remaining nine steps and verifies each:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\provision-nvda-worker.ps1
```

It deliberately stops short of one thing: **auto-logon**, which needs a password and
so must not live in a checked-in script. Without it, a reboot leaves no interactive
session and the worker cannot run at all. Prefer Sysinternals Autologon, which stores
the secret encrypted in LSA rather than plaintext in the registry:

```powershell
.\Autologon.exe -accepteula <user> <COMPUTERNAME> <password>
```

## Invariants

Each of these has broken capture at least once. `diagnose-nvda-worker.ps1` asserts
all of them.

| Invariant | Why | Breaks as |
|---|---|---|
| A console session is logged on | NVDA needs a desktop | 0 phrases, no error |
| Worker task is `LogonType Interactive` | otherwise no desktop | 0 phrases, no error |
| Worker task has an at-logon trigger | otherwise no restart after reboot | machine looks dead post-reboot |
| Worker runs **unelevated** (`RunLevel Limited`) | guidepup drives `nvda_noUIAccess.exe`, which cannot read elevated windows | silent NVDA on that window |
| NVDA install lives outside `%TEMP%` | Windows cleanup empties `%TEMP%` | install gutted; NVDA start times out |
| Edge profile lives outside `%TEMP%` | same cleanup | phantom "Welcome to Microsoft Edge" elements |
| `showSpeechViewerAtStartup = False` | that window's focus event pollutes probe results | every probe returns `"NVDA Speech Viewer"`; **capture-check still passes** |
| `ForegroundLockTimeout = 0` **in the live session** | Edge must be able to take focus. A registry write is NOT enough: the value is cached per session and Windows does not reliably consume it at logon, so it is applied via `SystemParametersInfo` by provisioning and re-applied by `run-server.cmd` on every start | **0 phrases, no error at all** |
| Firewall `NotifyOnListen = False` | the allow-app dialog is unclickable on a VM | session frozen |
| guidepup and NVDA versions paired | see below | `"NVDA not installed"` |

### Version pairing

`@guidepup/guidepup` **≤0.27** looks for the old NVDA Remote *add-on* certificate.
NVDA **2026.1.x** ships Remote Access in core and has no such add-on, so the pair
cannot connect. Since **0.29.0** guidepup accepts both certificate paths, and
resolves the install from `%LOCALAPPDATA%\guidepup` (override:
`GUIDEPUP_SCREEN_READERS_PATH`) instead of the old `HKCU\Software\Guidepup\Nvda`
registry pointer — which is what makes the install survive temp cleanup.

Always run `npx @guidepup/setup install nvda` **from the repo**: it reads the local
`@guidepup/guidepup`'s `manifest.json` to pick the NVDA build, which is what keeps
the two in lockstep. Note the `@guidepup/setup` CLI was rewritten in 0.24.0 into
`setup` / `install` subcommands; the old `--nvda-install-dir` flag is gone.

Known-good pairing (2026-07-25): guidepup **0.29.2** + NVDA **0.2.1-2026.1.1**.

## Verify a worker

Cheapest first — stop at the first failure.

```bash
# 1. is it up?
curl http://<worker>:8765/health   # -> {"ok":true,"screenReader":"NVDA","busy":false,"code":"<hash>"}
#   `code` identifies the DEPLOYED code. `npm run worker:code` compares it against your checkout
#   and exits 1 on a mismatch — the only deploy check that does not go through `utmctl exec`.

# 2. can it capture at all?
curl -X POST http://<worker>:8765/capture -H 'content-type: application/json' \
  -d '{"url":"https://example.com","steps":20}'

# 3. full capture regression (6 real captures, ~5 min).
#    MUST run in the console session -- via a scheduled task, not bare SSH.
#    There is now a task and a launcher for exactly this; see below.
node src/capture/nvda/capture-check.mjs
```

### Running the gate for real

`Stop-ScheduledTask -TaskName a11ysrv` **is not enough on its own.** The worker task carries
`RestartCount 5`, so Task Scheduler brings it straight back and `capture-check` still refuses on
`A capture worker is already serving on this machine`. Disable it, then re-enable it afterwards
-- forgetting the second step leaves a worker that will not come back at the next logon.

```bash
UUID=$(utmctl list | awk '$3=="a11y-worker-3"{print $1}')

# stop the worker and KEEP it stopped
utmctl exec "$UUID" --cmd powershell.exe -NoProfile -Command \
  'Disable-ScheduledTask -TaskName a11ysrv; Stop-ScheduledTask -TaskName a11ysrv; Start-Sleep 2;
   Get-Process node -EA SilentlyContinue | Stop-Process -Force'
curl -s -m 4 http://<guest>:8765/health && echo "still serving - the check will refuse"

# run the gate in the interactive session (a11ycheck is registered by provisioning)
utmctl exec "$UUID" --cmd powershell.exe -NoProfile -Command 'Start-ScheduledTask -TaskName a11ycheck'

# read the log. Copy first: `utmctl file pull` returns NOTHING for a file still held open.
utmctl exec "$UUID" --cmd powershell.exe -NoProfile -Command \
  'Copy-Item C:\Users\witness\a11y-witness\capture-check.log C:\Users\witness\cc.log -Force'
utmctl file pull "$UUID" 'C:\Users\witness\cc.log' | tr -d '\r' | tail -40

# PUT THE WORKER BACK
utmctl exec "$UUID" --cmd powershell.exe -NoProfile -Command \
  'Enable-ScheduledTask -TaskName a11ysrv; Start-ScheduledTask -TaskName a11ysrv'
```

`utmctl exec` returns no stdout here, so anything you want to read has to be written to a file
and pulled. The gate's verdict is its last line (`ALL CAPTURE CHECKS PASSED`) and its exit code.

`capture-check` asserts that probes **fired**, not what they heard, so it can pass
while the evidence is garbage. Always eyeball the probe values too — this is the
signal the product depends on:

| fixture | healthy `after` value |
|---|---|
| `disclosure-good` | `"…button, focused, **expanded**"` |
| `disclosure-bad` | `"…button, focused, **collapsed**"` (state never updated) |
| `forms-validation-good` | `"There is a problem. Email address is required."` |
| `forms-validation-bad` | `""` |

If good and bad look **identical**, the Speech Viewer is on. That is the tell.

The disclosure probe re-reads the control rather than waiting for a spontaneous
announcement, because NVDA 2026.1.1 announces only a document re-announce on
activation for BOTH pages — so the spontaneous route cannot separate them. Comparing
the state word against the control's original state is deterministic, and is what
4.1.2 actually asks.

## Debugging: error string → real cause

The error text is often actively misleading. This table is the shortcut.

| What you see | What it actually means | Fix |
|---|---|---|
| `Timed out waiting for NVDA to be running` **on the first capture after a boot** | nothing is wrong. Windows is still settling after auto-logon. This was the pool's DOMINANT failure and it got misdiagnosed as a bad clone, a stub install and a wedged worker, because whichever VM had been up longest worked and freshly booted ones did not — so the fault looked like it moved between guests | already handled: the start is retried once after 8 s. If you see it in a capture's diagnostics as `nvdaStartAttempt`, the retry did its job |
| `Timed out waiting for NVDA to be running`, **repeatedly, and no `nvda.log` anywhere** | the install is a stub — payload deleted, `nvda.exe` launches and dies | reinstall NVDA (Layer 4). Check `nvda.log` under `C:\Users\witness\AppData\Local\Temp` **with an explicit path**: `$env:LOCALAPPDATA` under `utmctl exec` resolves to SYSTEM's profile, not the worker's |
| `Cannot connect to NVDA` / `ECONNREFUSED 127.0.0.1:6837` **in server.log** | the speech channel dropped mid-capture | nothing to do — the worker forgets the reused NVDA and stays up; the next capture cold-starts one. It used to exit(1) here and the scheduled task did **not** reliably restart it |
| `NVDA not installed` | **rarely** a missing install. Thrown by `NVDAClient.connect` when the speech-channel cert is absent — usually guidepup too old for this NVDA | upgrade guidepup ≥0.29.2 |
| `NVDA is not supported` | `getNVDAInstallationPath()` found nothing at guidepup's cache path | `npx @guidepup/setup install nvda` from the repo |
| 0 phrases, `afterStart.lastSpoken` empty, no error | Three candidates, in order of likelihood: **`ForegroundLockTimeout` is not 0 in the live session** (Edge cannot take focus, so there is nothing to read); no interactive desktop; or a modal dialog freezing the session | run `scripts/apply-foreground-lock-timeout.ps1` **in the interactive session** and re-capture; otherwise log in at the console and dismiss the dialog *there* — it never surfaces over SSH |
| every probe `after` is `"NVDA Speech Viewer"` | Speech Viewer enabled; probes record that window, not the page | patch `nvda.ini` |
| phantom `"Welcome to Microsoft Edge"` / `"Sign in to sync data"` | fresh Edge profile; quick-nav escaped an empty document into browser UI | Edge policies + durable profile dir |
| `/health` refused, SSH fine | worker not started (task has no trigger), or firewall/IP changed | `Start-ScheduledTask -TaskName a11ysrv` |
| `npx.ps1 cannot be loaded ... scripts is disabled` | execution policy blocks the PowerShell shim | call `'C:\Program Files\nodejs\npx.cmd'` |

`afterStart.lastSpoken` in the response `diagnostics` is the single highest-value
field: if it is empty **and** every read is empty, the problem is the session, not
your code. (Empty `lastSpoken` alongside a full transcript is normal.)

## Local VM: reading the guest without a screen

If the worker is a local UTM VM, you have a control channel that needs no SSH and no
display, and it is what makes an unattended build debuggable:

```bash
utmctl file pull <uuid> 'C:\\a11y-first-boot.log'   # bootstrap + provisioning output
utmctl exec <uuid> --cmd cmd.exe /c "C:\\some.cmd"   # exit code only, NOT stdout
osascript -e 'tell application "UTM" to get address of serial port 1 of virtual machine id "<uuid>"'
```

`exec` runs as **SYSTEM in session 0**, so anything needing the user's desktop or `HKCU`
must go via a scheduled task with `-LogonType Interactive -RunLevel Highest`. A live log
is locked -- copy it in the guest first, then pull the copy. And the serial PTY carries
EDK2's console, so you can read and drive firmware before any OS exists.

See docs/local-worker-vm.md for the full set.

## Never do these

- **Never elevate the worker or the browser.** `nvda_noUIAccess.exe` cannot read
  elevated windows, so you would get empty transcripts. Elevation also summons UAC,
  and with `PromptOnSecureDesktop=1` that dialog lands on the secure desktop —
  unreadable by NVDA, unclickable by automation, fatal on a headless VM. Nothing in
  the capture path needs elevation.
- **Never `taskkill nvda.exe`.** Let Guidepup own the lifecycle via
  `nvda.start()` / `nvda.stop()`, or the speech channel destabilises. To clear a
  genuinely orphaned instance, prefer NVDA's own `nvda.exe -q`.
- **Never point the worker at a Store/UWP browser.** Portable NVDA has no browse
  mode there, so the read-through would be empty. Desktop (Win32) Edge only.
- **Never trust an all-pass `capture-check` alone.** See the probe-value table above.

## Worker dead, guest alive, `server.log` ends in a stack trace

```
Error: Cannot connect to NVDA
connect ECONNREFUSED 127.0.0.1:6837
```

Something else on the machine drove NVDA. It is a single machine-wide resource: a second
driver (`capture-check`, a stray `capture.mjs` run, a manual Guidepup script) stops the same
NVDA the worker is reusing, and the worker then connects to a corpse. The socket error arrives
asynchronously, outside any request handler.

Mitigated on three sides now, but worth knowing when triaging an old worker:

- the worker probes NVDA's port before reusing it, and cold-starts if nothing answers
  (`lastSpokenPhrase()` is NOT a liveness check — it reads Guidepup's local phrase log and
  answers happily while NVDA is dead);
- `capture-check` refuses to run while a worker is serving, and says how to stop it;
- `a11ysrv` has `RestartCount 5` so a crashed worker comes back. Before that it went to
  "Ready" and stayed there: the at-logon trigger covers reboots, not process death.

If a cold start reports **"NVDA is already running"**, a leftover instance is blocking it. The
worker clears that itself (`nvda.stop()` then retry). By hand:

```powershell
Stop-ScheduledTask -TaskName a11ysrv
Get-Process node -EA SilentlyContinue | Stop-Process -Force
Start-ScheduledTask -TaskName a11ysrv
```

Do **not** `Stop-Process nvda*` to fix this. Killing NVDA outside Guidepup is what produces
the leftover state in the first place — it is how this failure was reproduced.

## `nvda.start failed: NVDA is not supported`

You ran the capture in **session 0**. Guidepup cannot drive NVDA without an interactive
desktop, and reports it as an unsupported platform rather than a missing session.

`utmctl exec` and bare SSH both land in session 0. Neither can run a capture, however correct
everything else is. Run it through a scheduled task with `LogonType Interactive` instead:

```powershell
$a = New-ScheduledTaskAction -Execute 'C:\Users\witness\capcheck.cmd'
$p = New-ScheduledTaskPrincipal -UserId 'A11Y-WORKER\witness' -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName capcheck -Action $a -Principal $p
Start-ScheduledTask -TaskName capcheck
```

Note the two failure modes read almost identically and are not the same thing:
`"NVDA is not supported"` is the wrong session, `"NVDA not installed"` is a Guidepup/NVDA
version mismatch (see above).

Also: stopping the worker with `Stop-Process` leaves its NVDA **orphaned** — the process
survives, still holding port 6837, because the clean shutdown path never runs. The next cold
start recovers from that by itself, but if you are debugging by hand, expect to see NVDA
running with no worker attached.

## `utmctl` reports the VM as `unknown`, or fails, while the bundle is clearly there

`utmctl` drives the **UTM app**; it is not a standalone daemon. With UTM closed it cannot
answer, and an intact bundle plus a state of `unknown` reads as a corrupted VM. It is not.

```bash
pgrep -x UTM              # utmctl needs this
pgrep -f QEMULauncher     # is a guest actually running?
utmctl list               # registered, and under which UUID?
./scripts/local-worker/worker-ctl.sh status   # launches UTM if needed, explains `unknown`
```

The other cause is contention. One machine hosts **one** VM and **one** NVDA, so a second
shell or agent restarting the worker makes your view wrong: mid-restart the state genuinely is
`unknown`, and the worker genuinely is unreachable for the minute its scheduled task takes to
return. Same shared-resource problem as running `capture-check` against a live worker. Check
that nothing else is mid-operation before diagnosing corruption.

## `/health` looks intermittently unavailable during captures

Reported from a second shell, and worth being precise about, because the honest answer is
"mostly not, and here is when it genuinely is".

Measured against a live capture on the local VM: **30/30 direct probes to `/health` succeeded,
none slower than a second**, plus 10/10 `utmctl ip-address` calls and 5/5
`worker-ctl.sh status`. So the endpoint does not generally fall over under capture load — the
worker is single-threaded but a capture is almost entirely `await`ing NVDA round trips, which
leaves the event loop free to serve.

Three windows where it IS legitimately unavailable, none of them a fault:

- **A worker restart takes it down for 5-10s.** Deploying `capture-core.mjs` requires one.
- **NVDA cold-starts every 25 captures** (the reuse recycle). That window is the guest's
  busiest, and a short client timeout can lapse in it.
- **A second shell restarting the worker** takes it down for yours. One VM, one NVDA.

`busy: true` is **not** unavailability. Captures are serialised by design; the worker returns
`429` for a second concurrent capture and keeps answering `/health` throughout.

`worker-ctl.sh` now treats health as a verdict rather than a probe: three attempts before
reporting unreachable, and when it does fail it distinguishes "the guest is up, the WORKER is
not answering" from "no guest IP at all, the VM is not ready". If you are polling `/health`
yourself, do the same — one timed-out request is not evidence of a dead worker.

## The guest's console window is blank / the worker looks hung

It is not hung, and the window is no longer blank — but if you are on an older worker, this is
why. `run-server.cmd` used to redirect everything to `server.log`, so the console on the guest
showed nothing at all. A capture takes ~12s, during which a working worker and a wedged one
look identical from the screen.

Measured, in case the suspicion returns: back-to-back captures have a **0-1 ms** gap between
them. There is no dead time between captures; the worker is busy the whole time. If it looks
idle, it is mid-capture.

`server.mjs` now writes each line to **both** the console and `server.log`. Deliberately
in-process rather than piping the launcher through PowerShell's `Tee-Object`, which on Windows
PowerShell 5.1 has no `-Encoding` parameter and writes UTF-16 — that changed the log's encoding
partway through the file and broke every reader of it.

Reading the log from the host: **copy it first.** The live file is held open by the worker and
`utmctl file pull` returns nothing for a locked file, silently:

```bash
utmctl exec "$UUID" --cmd powershell.exe -NoProfile -Command \
  'Copy-Item C:\Users\witness\a11y-witness\server.log C:\Users\witness\log-copy.txt -Force'
utmctl file pull "$UUID" 'C:\Users\witness\log-copy.txt'
```

## Stopping a VM takes 2+ minutes and says "guest ignored ACPI shutdown"

The guest is almost certainly shutting down fine. The wait loop was the problem, and it only
misbehaves once you have more than one worker.

It used to break out only when **no** `QEMULauncher` process existed anywhere on the host. With
a single VM that is equivalent to "our VM has stopped"; with a pool, the other workers' processes
keep it spinning for the full 120s grace, after which it force-stops a VM that shut down cleanly
two minutes earlier. The tell is the force-stop then failing:

```
guest ignored ACPI shutdown after 120s -- forcing
The virtual machine is not running.
```

That second line means it had already stopped. The cost is not just the wait: every "clean"
shutdown was being recorded as a power cut, which is what `--request` exists to avoid, so the
next boot could spend time on dirty-volume repair.

Fixed by polling **this VM's own** qemu process (`pgrep -f "uuid $UUID"`). A stop went from 154s
to 17s, and the whole pool from ~7 minutes to 13 seconds. Note that polling `utmctl status`
instead is correct but too slow to poll -- forty iterations took 464s of wall clock, because the
loop counted its sleeps and not utmctl's latency.

Stops now also ask Windows directly through the guest agent (`shutdown /s /t 0`) with ACPI as
the fallback, since the guest agent needs neither the network nor a working power-button mapping.
