# NVDA capture worker: provisioning and debugging runbook

Everything needed to stand up, verify, and repair the Windows machine that drives
real NVDA. Written for whoever (or whatever) is holding the terminal — no prior
context assumed.

> **`utmctl` appears throughout, and UTM is DEPRECATED — a testing path, not the fleet.** This project
> captures on ten bare-metal Windows machines (`inventory.yml`), which have no `utmctl` and are reached by
> SSH; `npm run fleet:status` is the equivalent of every `utmctl` status command below, and `fleet:deploy`
> — never `worker:deploy` — is how code reaches them. **The `utmctl` procedures are kept and are still
> correct for a local VM**, which remains a reasonable option for a single contributor on a Mac. What has
> changed is which one this project exercises daily, and therefore which one is likely to be right when
> the two disagree. Every UTM entry point now warns at runtime, so a command from this page that prints a
> deprecation notice is behaving as intended.
>
> The section headed "Diagnosing a guest without `utmctl exec`" is worth reading FIRST rather than as a
> fallback: `utmctl exec` wraps QEMU's `guest-exec`, which is known-unreliable on Windows, and a
> diagnosis built on it can return success having run nothing.

Three scripts do the work; this document explains *why* each step exists, so you can
reason when reality diverges from them:

| | |
|---|---|
| `packages/worker-fleet/src/provisioning/diagnose-nvda-worker.ps1` | Read-only. PASS/FAIL per layer with the fix for each. **Start here when something breaks.** |
| `packages/worker-fleet/src/provisioning/provision-nvda-worker.ps1` | Set up or **repair** a worker. Idempotent — re-running it is the normal fix. |
| `packages/worker-fleet/src/provisioning/bootstrap-windows-worker.ps1` | Fresh Windows → provisioned worker (Node, Git, SSH, clone, then hand off to the above). |

> **Want the worker on your own machine instead of a separate box?** See
> [`local-worker-vm.md`](./local-worker-vm.md) — NVDA runs natively on Windows ARM64,
> so a UTM VM on an Apple Silicon Mac works, and a provisioned image can be handed to
> other developers so they skip the setup entirely. That is a far better debugging loop
> than validating capture changes through CI.

Run either one remotely by copying it over and invoking it with `-File`:

```bash
scp packages/worker-fleet/src/provisioning/diagnose-nvda-worker.ps1 user@worker:C:/Users/user/
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
irm https://raw.githubusercontent.com/DanBeckDev/a11y-witness/main/packages/worker-fleet/src/provisioning/bootstrap-windows-worker.ps1 | iex
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
curl http://<worker>:8765/health   # -> includes code and environment versions
#   `code` identifies the DEPLOYED code. `npm run worker:code` compares it against your checkout
#   and exits 1 on a mismatch — the only deploy check that does not go through `utmctl exec`.
#   `environment` is reported by the worker itself: NVDA, Edge, guidepup, Node, Windows,
#   and workerCode. Capture responses carry the same object for dataset provenance.

# 2. can it capture at all?
curl -X POST http://<worker>:8765/capture -H 'content-type: application/json' \
  -d '{"url":"https://example.com","steps":20}'

# 3. full capture regression (6 real captures, ~5 min).
#    MUST run in the console session -- via a scheduled task, not bare SSH.
#    There is now a task and a launcher for exactly this; see below.
node packages/nvda-worker/src/capture-check.mjs
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
| `NVDA is running but not speaking` | **should now be rare — the speech channel is probed before every capture.** The cause: guidepup reaches NVDA over a TLS socket (NVDA Remote, 127.0.0.1:6837) and speech is *pushed* back over it, so when that socket goes half-open every keystroke still succeeds and nothing is ever spoken. Guidepup reconnects only on a socket `error`, which a half-open connection never raises — no keepalive, no read timeout, no `reconnect()`. Previously NVDA answers keystrokes but its speech channel has died. It is stochastic: across the corpus ~45% of NVDA instances survive to the 25-capture recycle, while in a tight loop on a swapping host lifespans of 5-9 were measured. Reuse is causal (with `reuseScreenReader:false`, 8 of 8 ran clean) | **nothing to do.** The worker retries once itself on a fresh NVDA before answering, so the caller never sees it. Do **not** reboot the guest, and do **not** lower `MAX_CAPTURES_PER_NVDA` — most instances reach 25, so recycling early costs more than it saves. Watch `/health.vitals.recoveries`: if it climbs, suspect host memory first |
| every capture on a worker slow (~45s) *and* mute failures *and* `/health` blackouts | **the host is out of memory, not the worker degrading.** A worker VM costs the host ~7 GB, not its configured 4096 MB; guests get swapped out from under NVDA. This exact pattern was misread as "the workers are dying" for a day | `npm run doctor` prints what the host can hold. Run fewer workers, or `A11Y_MAX_WORKERS=N`. Note the host's own load counts — a `npm test` on the Mac competes with the guests |
| 0 phrases, `afterStart.lastSpoken` empty, no error | Three candidates, in order of likelihood: **`ForegroundLockTimeout` is not 0 in the live session** (Edge cannot take focus, so there is nothing to read); no interactive desktop; or a modal dialog freezing the session | run `packages/worker-fleet/src/provisioning/apply-foreground-lock-timeout.ps1` **in the interactive session** and re-capture; otherwise log in at the console and dismiss the dialog *there* — it never surfaces over SSH |
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
npm run worker:ctl -- status   # launches UTM if needed, explains `unknown`
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

## Incidents moved from CLAUDE.md (#458)

### The speech channel is a socket, and a dead one looks exactly like a healthy NVDA

See `docs/adr/0034-the-speech-channel-is-a-socket-forced-to-fail-loud.md` for the decision and the two
rejected alternatives (restarting NVDA; a bare `socket.destroy()`). This is the incident that forced it.

This is the root cause of the pool's most expensive fault, and the fix is one round trip.

Guidepup reaches NVDA over a **TLS socket to NVDA Remote on 127.0.0.1:6837**, and speech is *pushed*
back over it. Keystrokes are writes; speech is a read. So when that socket goes half-open:

- `nvda.next()` still succeeds — the write is accepted
- nothing is ever spoken back
- NVDA looks completely healthy and says nothing

Guidepup cannot notice. Checked in 0.29.2: it reconnects only on a socket `error` event, a half-open
TCP connection raises none, and there is **no keepalive, no read timeout and no heartbeat** in its
client. (Guidepup also has **no debug mode**: two env vars, no logging. Its config was identical on
healthy and failing guests, so misconfiguration was never the cause.)

> **This section used to say the only way to rebuild the channel was `stop()` + `start()`, because
> `NVDAClient` "is not exported". That is wrong and it cost real time.** `NVDAClient.js` ends with
> `exports.NVDAClient = NVDAClient` — it is absent from the package *index*, not from the module. More
> importantly, **guidepup's reconnect logic already works; it is starved of its trigger.** Lines 99-110
> disconnect, reconnect, re-join the channel and reset the failure counter — all of it hanging off an
> `error` event that a half-open socket never emits.
>
> So `speech-channel.mjs` hands it that event: `socket.destroy(err)` emits `'error'` and guidepup
> recovers itself, in **under a second instead of ~23 s**, without touching NVDA. Note `destroy()` with
> no argument emits only `'close'`, which guidepup ignores — that distinction is the whole trick and is
> asserted in the tests. The socket is captured by wrapping `tls.connect`, because `NVDA#client` and
> `NVDAClient#socket` are genuine `#private` fields and unreachable by reflection.
>
> This matters beyond speed: **repeated NVDA restarts are what produce the `nvdaHelperRemote
> (injection_terminate)` modal that wedges a guest**, so the expensive remedy was feeding the fault it
> was treating. `ensureSpeechChannel` now rebuilds the socket first and only restarts NVDA if the probe
> still hears nothing.
>
> When reading a dependency's behaviour, read the dependency. Both wrong claims above came from its
> public API surface rather than its source, which is in `node_modules` and is 316 lines.

So `ensureSpeechChannel` probes it *before* committing a capture: clear the log, `readLine`, check a
phrase came back. Measured across all three guests, 7 interleaved rounds each, same page, same tool:

| | median | IQR | recoveries |
|---|---|---|---|
| before | 36.7 / 42.0 / **93.7 s** | 9.1 / 9.0 / 20.7 | 0/7 / 1/7 / **5/7** |
| after | **12.4 / 12.4 / 12.3 s** | **0.1 / 0.6 / 0.3** | **0/7 all three** |

The probe costs 0.7 s and **never had to restart NVDA once** — so the gain is not from proactive
restarts, it is that exercising the channel early stops the bad state arising. `windowsActivate` also
fell 12.8 s → 2.1 s, which suggests a half-dead NVDA was contending for the foreground and slowing
Edge's grab for it.

Two caveats worth keeping: the mechanism is inferred rather than proven, and 21 captures cannot prove an
intermittent fault is *eliminated* — only that it did not occur once across a pool that was averaging
6 of 21 before. Watch `/health.vitals.recoveries`; if it climbs again, the theory is wrong.

### A guest whose NVDA is broken looks perfectly healthy — watch `recoveries`

The worst worker fault this pool has had produced **zero failures**. One guest's NVDA went mute on
**4 of 4 captures**; the worker's retry absorbed every one, so every capture succeeded, `failures`
stayed at 0, and the eviction rule (three consecutive *failures*) could never fire. The only symptom
was that it ran at **122.9 s per capture against a healthy peer's 40.6 s**, and wall-clock time says
"slower" without saying where.

**`npm run worker:compare <page> <worker> <worker>`** is how you find it. It puts the phases side by
side, which took the diagnosis from hours to one command:

```
phase              w1      w2   spread
nvdaStart        19.1     0.0     19.1   <- the whole gap. 0 = NVDA reused; 19s = cold-started every time
windowsActivate  11.6    14.4      2.8
sweep             6.3     6.6      0.3   <- identical
```

Before that tool existed I attributed this to Edge's launch, then the Edge profile, then the sweep — all
three wrong, because `bench-capture` prints one worker at a time and I compared wall times. It also shows
the per-sweep detail capture-core already recorded and nothing displayed: **ms up with round-trips flat
means each trip is slower; trips up means the sweep is walking more.** Different causes.

The signal is now acted on, not just printed:

- `/health.vitals.recoveries` — faults the worker papered over. The one number that rises while
  everything still appears to work.
- `npm run doctor` reports `DEGRADED` with the repair command.
- **A run retires a degraded worker automatically** (`shouldRetireWorker`): it stops taking cases, nothing
  is requeued (its captures were fine), and the run summary names it. Never the last worker standing —
  a slow run beats no run.

The repair for a guest in this state is `provision-nvda-worker.ps1`, which reinstalls NVDA.

### A freshly booted worker used to fail its first capture, every time

Reproduced on two guests in one session: cold boot, capture 1 fails `NVDA is running but not speaking`,
capture 2 succeeds. Since a run **starts the workers it needs**, that cost one case per worker on most
runs — and it was invisible because the run classified it transient and quietly retried.

The worker now **retries once itself**, on a fresh screen reader, before answering the caller
(`worker-recovery.mjs`). capture-core already stops NVDA on any failure, so the retry necessarily
cold-starts a clean one — the same work it was going to do on the next request; the only change is who
pays for it. It is bounded at one extra attempt and only ever follows a real fault, which is what
separates it from the idle warm-up loop that broke the pool. The hard timeout is excluded: it has
already spent its whole budget, so the run reissues that one instead.

`/health.vitals` now reports `uptimeMinutes`, `freeMemoryMb`, `captures`, `failures` and
**`recoveries`**. Watch `recoveries`: it counts faults the worker papered over, so a guest that is
degrading shows up there while every capture still succeeds.

### What degrades is NVDA's speech channel, not the VM — and it fails on a survival curve

NVDA can stop speaking while still answering keystrokes. It is **stochastic, not a counter**, and the
rate depends on how loaded the host is. Two datasets, and the difference between them is the point.

**The corpus — 1,939 captures carrying a reuse counter, across real dataset runs:**

```
reuse count:  2-5   6-10  11-15  16-20  21-24   25
captures:     480   460    382    321    242    54     nvdaRecycle fired 51 times
```

That is a survival curve — about 120 NVDA instances per count early on, ~54 reaching 25 — so roughly
**45% of instances do survive to the `MAX_CAPTURES_PER_NVDA = 25` recycle**, and the recycle is live
code, not dead. (`screenReaderMute` appears in 0 captures on disk because a mute *throws*, so it is
never written. Absence there is not evidence.)

**A tight loop on a memory-pressured host — 30 back-to-back captures of one page:**

```
1 2 3 4 5 [6] 7 8 9 10 [11] 12 13 14 15 [16] ... [25] [26]
lifespans: 6, 5, 5, 9, 1     30/30 succeeded, 5 recoveries, 0 failures
```

**Do not generalise from the second dataset — an earlier version of this section did, claiming NVDA
"dies about every 5 captures" and that the 25-recycle "never fires". The corpus refutes both.** Those
lifespans are the low tail, measured while the host was swapping and one page was being hammered at
maximum rate. The plausible reading — consistent with both datasets but **not proven** — is that a
short NVDA lifespan is itself a *symptom* of host memory pressure, which would mean the capacity cap
above reduces mute frequency as a side effect. Worth testing on a quiet host before anyone relies on it.

What follows for the constant: **leave `MAX_CAPTURES_PER_NVDA` at 25.** Lowering it to ~4 would force a
~23 s recycle on the ~45% of instances that would otherwise run to 25 — a net loss. The earlier estimate
that this was "worth ~9 s per capture" came from the unrepresentative loop.

Reuse is nonetheless causal: with `reuseScreenReader:false`, **8 of 8 captures ran clean with no mute at
all** — but a fresh NVDA per capture costs ~48 s against ~25 s reused, because stopping and starting
NVDA is most of the difference. So reuse stays, and the retry below is what makes it *correct*.

A mute **used** to cost ~150 s to recover, because a silent NVDA answers all 150 advances with nothing
and the read-through was then retried in full — 300 wasted round trips before
`failIfScreenReaderIsMute` even ran. The read now stops after `MAX_SILENT_STEPS` (8) consecutive silent
advances, and `readWithRetry` refuses to re-read a screen reader already found silent.

**That rule needs two signals, and the reason is asymmetry.** An empty read is unremarkable on its own
(the warning at the top of capture-core says so), so silence only ends a read when NVDA *also* said
nothing at startup AND nothing substantive has been heard yet. When NVDA spoke at startup the branch is
unreachable and a read-through behaves exactly as before. Getting this wrong would silently *shorten*
transcripts, which is the evidence rot that once deleted the h1 announcement from 90 captures while
every check stayed green — hence `read-through.test.ts`, whose first assertion is that 40 consecutive
empty reads on a healthy capture change nothing.

### Recovery is keyed on fault CODES, never on message text

`capture-faults.mjs` defines `FAULT.SCREEN_READER_MUTE` and `FAULT.SCREEN_READER_START_FAILED`;
`captureFault()` attaches one to the thrown Error, the worker returns it as `fault` in the 500 body, and
both `worker-recovery.mjs` (guest) and `capture-decisions.mjs` (host) match on it.

This replaced a regex over `error.message`, which was a check that could not discriminate: reword the
message in capture-core and recovery stops working in production, while the unit tests keep passing
because the string they assert on lives in the test file rather than at the throw site. The tests now
drive the real gate — `failIfScreenReaderIsMute` is exported for exactly that.

Two references argue the same point, and they are worth reading before adding another string match:
*Secure by Design* §9.2.2 ("Designing for failures") — model expected domain failures as explicit
results, not exceptions to be parsed; and *The Product-Minded Engineer* ("Repackage Errors") — make
errors programmable through specific types and structured metadata "rather than forcing callers to
parse messages". A mute NVDA recurs often enough across a run — ~55% of NVDA instances die before
their recycle — to be an expected domain failure rather than an exception.

`fault` on the wire is **additive**: an older host ignores it and keeps matching text, so the host and
guest can be deployed independently.

### "The worker is dead" is usually a wedge, not a death

If `/health` answers but **every capture returns 429 `a capture is already in progress`**, the worker
is *wedged*, not dead: a previous capture hung, so `busy` was never released. This cost two days of
misdiagnosis — bad clones, a stub NVDA install, guest-agent failures — because from outside it is
indistinguishable from a dead machine. A hard capture timeout now abandons the hung capture, releases
`busy`, and cold-starts NVDA, so it recovers on its own.

**What put it there: restarting NVDA repeatedly.** NVDA responds to that with a modal dialog on the
guest desktop — `nvdaHelperRemote (injection_terminate): Error waiting for local thread to die` — and
a modal dialog blocks input, so the next capture hangs. One guest took QEMU down with it. Hence the
rule: **nothing may restart NVDA while a worker is idle.** Warm-up happens once at boot; after that
NVDA is the capture's business, and `startScreenReader` already cold-starts a dead one. If you find
yourself adding a health-driven NVDA restart, this is the loop you are rebuilding.

Two related facts worth not rediscovering:

- **`utmctl exec` and `file pull` need the guest's logged-on session.** They fail before auto-logon
  completes and work afterwards, which is one cause for two symptoms — not a broken guest agent. If
  `exec` is silent, the guest has not finished logging on; wait rather than diagnose.
- **`server.log` persists on the guest**, and it is the record of a worker's death — still there after
  it comes back, which is the only way to read a fault that killed it.
  - **On the bare-metal fleet, pull it while the worker is down: `npm run fleet:logs`.** Ansible reaches
    the box over SSH whether or not the worker process is running, and `collect-logs.yml` takes
    `server.log`, one rotation back, and NVDA's two logs into `runs/worker-logs/`. **`/diagnostics`
    cannot serve this case** — it is an endpoint ON the worker, so it answers only when the worker does.
  - **On a UTM guest you cannot**, for the reason in the bullet above: `file pull` needs the logged-on
    session. Read `server.log` after the worker recovers instead.

  **This bullet used to deny the fleet case outright, with no such split** (#1226) — a flat statement
  that the log could not be pulled from a worker that was down. That was true of `utmctl file pull` and
  written as a fact about the world: a correct claim about one mechanism, stated unscoped, under a
  heading an operator reads *while triaging the case it is wrong about*. Its `(see above)` made it look
  scoped to a careful reader and asserted to a fast one, and once #1216 wired `fleet:logs` the
  repository held both the claim and a command disproving it.

  *(Paraphrased rather than quoted, deliberately: #1226's own open-check greps for that sentence, and
  a verbatim quotation here would match it forever — a correction that cites the text it removes keeps
  the count at one and reads as a fix that did not work. The technique is `worker-capture`'s, from
  #1217, and this check caught me walking into the trap two hours after reviewing it.)*

## Diagnosing a guest without `utmctl exec`

`utmctl exec` wraps QEMU's `guest-exec`, which is **known-unreliable on Windows** — upstream reports
qemu-ga stopping at random and failing to open its own channel. Observed here in one session on one
guest: it worked, silently wrote nothing, returned OSStatus -2700, then worked again. Do not build a
diagnosis on it.

Everything you would have reached for it is served over HTTP instead:

```bash
curl -s http://<guest-ip>:8765/diagnostics | jq .
```

- `edgeProfile` + `edgeProfileBreakdown` — the per-subtree sizes that found 348 MB of `BrowserMetrics`
- `processes` — orphaned `msedge` counts, the load that used to make the next `nvda.start` time out
- `edgePolicy` — drift from what provisioning set, reported rather than silently re-applied
- `screenReader` — NVDA's config (synth, Speech Viewer) plus its log **and `previousLog`**; NVDA rotates
  on every start, so a session that went mute only exists in the old file
- `disk`, `serverLog`

`GUIDEPUP_SCREEN_READERS_PATH` is guidepup's own env var (not this project's `A11Y_*` convention), read
by the worker to find NVDA on disk. It defaults to `%LOCALAPPDATA%\guidepup`, which is where guidepup
installs NVDA on a guest it provisioned itself. Set it if a guest's NVDA lives somewhere else — a
custom Windows image, or a portable install — and `nvdaRoot` in `/diagnostics` reports what the worker
is actually looking under, so a missing-NVDA symptom there is a real place to start.

`/health` stays cheap because it is polled; `/diagnostics` walks directories and shells out, so it is
on-demand only.

### Capture timing and the `windowsActivate` cost analysis (from Environment facts)

- **A capture is ~12.4 s**, measured across all three guests over 7 interleaved rounds each (medians
  12.4 / 12.4 / 12.3, IQR ≤ 0.6, statistically indistinguishable). That is *after* the speech-channel
  probe; before it the same pool measured 36.7 / 42.0 / 93.7 s with IQRs up to 20.7. If you see anything
  like the older numbers, check `/health.vitals.recoveries` first — that is the fault returning, not the
  host being busy. Historic figures in this repo of "13–19 s", "27 s", and "45 s" all predate the fix.
- Quote the host state with any timing number. Your own `npm test` or a browser competes with the guests.
> **EVERY FIGURE IN THIS SECTION IS MEASURED ON THE SYNTHETIC CORPUS, AND IT SAID SO NOWHERE UNTIL
> 2026-09-09.** A corpus capture is ~12 s of a generated page; a real page is four to eight minutes
> (#311). The two populations do not share a shape, and the headline below — `windowsActivate` at ~37%,
> "the biggest remaining cost" — is **0.1% of a real page**. It is not wrong; it is bounded, and the
> boundary is the part that was missing. See *What a REAL page is made of* immediately after it.

- **The largest single phase is `windowsActivate`, at ~10 s, and it is Edge starting.** Edge is
  launched *and quit* for every capture, so its cold start is on the critical path every time —
  `waitedMs: 10784` against an 800 ms settle. That is ~37% of a capture, and it is the biggest
  remaining cost **of a corpus capture**. Three routes were evaluated; **two of them are dead ends, and
  the analysis is worth keeping so nobody re-derives it.**

  | route | verdict |
  |---|---|
  | Overlap NVDA's start with the wait for Edge's window | **worthless.** `nvdaStart` is ~0 s on a warm capture, and ~83% of captures reuse NVDA. There is nothing to overlap on the path that matters. |
  | Re-enable Edge's startup boost | **cannot work alone.** Cleanup calls `windowsQuit("msedge.exe")` with a `taskkill /im msedge.exe /f` fallback, so it kills Edge *by image name* — including the pre-warmed background process. The next capture cold-starts anyway. |
  | Keep Edge alive between captures | **the only real option**, and it subsumes startup boost. |

  The third needs care, not courage. Do **not** navigate an existing window via the address bar:
  captures run `--app`, which has no address bar, and abandoning `--app` resurfaces the browser chrome
  that `"Welcome to Microsoft Edge"` phantoms came from. The shape that should work is *keep the Edge
  process, open a fresh `--app` window per capture, and close only that window* — Chromium reuses the
  process, so the window appears fast and the announcements stay identical. It touches window focus,
  which this project's own notes call "the #1 flakiness fix", and it is testable only on the VM.

  **Mitigating the recapture cost.** This is why `npm run evidence:check` exists: it compares evidence
  field by field on a stratified sample and says whether the change is evidence-neutral. If it reports
  SAME, the change ships without invalidating the cache — the key is a proxy, the diff is the direct
  measurement. If it reports CHANGED, the recapture is genuinely required, and the cheap moment to pay
  it is **bundled with any other pending `CAPTURE_PROTOCOL_VERSION` bump**, so 2,122 captures are
  recaptured once rather than twice.

#### What a REAL page is made of — #397, measured 2026-09-09

##### What CLAUDE.md said until 2026-09-09, kept verbatim

Both sentences are right about the corpus and wrong about a real page, and neither said which. Kept
here in full rather than deleted, because a figure with its population attached is worth more than a
figure removed — and because `claude-md-content-preservation.test.ts` requires that anything trimmed
out of CLAUDE.md still exist somewhere a reader can find it:

> The largest single capture phase is `windowsActivate` (~10 s, ~37%) — Edge cold-starting every time. Keeping Edge alive between captures is the only real fix. [Route analysis →](docs/nvda-worker-runbook.md#capture-timing-and-the-windowsactivate-cost-analysis-from-environment-facts)

> Other probes beyond the default set are opt-in over the wire (`probeFocus`) so a capture
> never pays for evidence nobody asked for. `focusOrder` costs ~8 s on top of a ~15 s capture.


Three pre-registered pages, per-phase from the captures' own `atMs` marks, on the fleet at `8c80f066`
(nine boxes, CONSISTENT, deployed 07:59:47Z). **The marks cover 97% of wall clock on all three**, so
almost nothing is unaccounted for.

| phase | hubspot (271 s) | calendly (267 s) | ikea (471 s) |
|---|---|---|---|
| **sweep** | **88.5 s / 32.7%** | **104.5 s / 39.2%** | **369.9 s / 78.5%** |
| readThrough | 27.6 s / 10.2% | 51.2 s / 19.2% | 54.4 s / 11.5% |
| titleSource | 36.2 s / 13.3% | 36.3 s / 13.6% | — |
| focusOrder | 72.5 s / 26.7% | 16.3 s / 6.1% | — |
| focusReveal | 14.7 s / 5.4% | 18.1 s / 6.8% | — |
| **`windowsActivate`** | **318 ms** | **306 ms** | **321 ms** |

**`windowsActivate` is a third of a second**, three independent measurements agreeing to within 5% —
the result here I would defend hardest. The three routes analysed above are optimising it, and on a
real page there is nothing there to win. Keep them for the corpus; do not quote them as "the biggest
remaining cost" without naming which population.

**`sweep` is the largest phase on every page** — 81.8 s, 95.1 s and 358.7 s summed from the marks, and
78.5% of IKEA's run on its own. **This does not say the sweeps are wasteful**: `collectByType` walks the
page by quick-navigation and that is how this tool sees structure at all.

> **THIS PARAGRAPH SAID "AND THE ONLY ONE THAT SCALES WITH THE PAGE" UNTIL 2026-09-09, AND THAT CAUSE WAS
> WRONG.** The share is right; the mechanism behind it is not the walk. Replaying the same three captures
> per sweep (#659 step 1) puts **every sweep type on every page at 108–210 ms per round trip — except
> `formField`**, which is 385 ms/trip on hubspot's 4 fields, 1,233 on calendly's 18 and 1,478 on IKEA's
> 100. **What makes that one sweep expensive is NOT KNOWN**, and the first answer written here was wrong:
> it said `probeForms` activating every field, on the strength of `sweepEveryStructuralType` passing
> `onItem: onFormField` for that sweep alone and `operateControl` being gated on the flag. **Tested the
> same day, two arms on one worker: `--probe-forms` ON gives 1,283 ms/trip and OFF gives 1,279.** Four
> milliseconds, with `formChanges` going 6 to 0, so the flag did what it says and the cost did not move.
> The obvious second candidate is weakened too — `probeKindFor` returns `disclosure` BEFORE the
> `probeForms` gate, so collapsed controls are probed either way, but IKEA has **zero** "collapsed"
> phrases across its 100 fields and the highest per-trip cost of all.
>
> So the measurement stands and the mechanism is open. hubspot's 385 ms/trip is the one low reading and
> its four phrases are plain buttons that earn no probe at all, which is a lead rather than a finding.
> Answering it needs a per-item timing mark `collectByType` does not carry — a capture-path change, not
> another run.
>
> **And `trips` does not count that work**, so "ms per trip" for `formField` is a ratio whose denominator
> excludes most of its own numerator. Reading `worker:compare`'s rule — *ms up with trips flat means each
> trip is slower* — against these three would have given the wrong answer with real numbers: hubspot and
> IKEA are 422 and 434 trips against 81.8 s and 358.7 s.
>
> **IKEA did not walk more; it ran out of budget.** Its `formField` sweep spent 322.3 s and stopped on
> `deadline`, and `graphic`, `link`, `list`, `frame` and `postSubmit` then reported `found: 0` with the
> same stop — they never ran. `structureCrossCheck` on that capture reads `link: sweepEntries 0,
> oracleDistinctNames 340` and `graphic: 0 vs 165`. **That 471-second page examined two structural types
> out of eight**, and the only thing that said so was a cross-check nothing reads by default.

**`focusOrder` is not ~8 s here either** — 72.5 s, 16.3 s, and outside ikea's top six. Wrong in both
directions against the corpus figure, and by an order of magnitude on hubspot.

> **AND THE CENSUS ON EVERY CALENDLY CAPTURE DESCRIBES A PAGE WE NAVIGATED TO, NOT CALENDLY.** This
> paragraph said the site served two different renders, from 11:35Z to 12:1xZ on 2026-09-09, and that was
> wrong — `worker-audit` challenged it and the artefacts settle it against me.
>
> **`domCensus.targetMatch` reads `fallback` on all four calendly captures and `matched` on every hubspot
> and ikea capture.** The sweep read the full calendly every time — `structural` gives 44–45 headings at
> ~150 s — and the census ran ~110 s later, by which point the capture's own probes had navigated away:
> `routeChange` records `titleBefore: "Sign in - Google Accounts"`, `titleAfter: "Privacy Notice
> Calendly"`. So `link=5 heading=1 tabbable=11` is the census of a privacy notice, and reading it as the
> page under test is what produced the "two renders" claim.
>
> **The consequence is a defect of ours, not a property of the site.** `structureCrossCheck` then reported
> `heading: sweepEntries 44, oracleDistinctNames 1` — the sweep's calendly against a census of another
> document — and the coverage sentence printed reach of 44 against a ground truth of 1, which is absurd on
> its face and nothing refused. **A capture whose `targetMatch` is `fallback` must refuse to compare its
> sweep against that census at all.** Filed as #685.
>
> hubspot and IKEA are `matched` on every capture, so their figures here, in #397 and in #311 are
> unaffected, and so is the IKEA truncation in #677.

n=1 per page, one fleet, one day; every split except `windowsActivate` and the `sweep` share is a
single observation. The captures are on disk and re-readable — the first time this question could be
answered from artefacts rather than by re-running it, which is #431 landing the same morning:

```
runs/witness/2026-09-09T08-04-30-422Z-www-hubspot-com.json    271s
runs/witness/2026-09-09T08-12-27-003Z-calendly-com.json       267s
runs/witness/2026-09-09T08-20-19-020Z-www-ikea-com.json       471s
```

Local and gitignored, so the paths are the record that the next re-check has something to read.
