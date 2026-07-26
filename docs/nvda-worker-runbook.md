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

```powershell
winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements
git clone https://github.com/DanBeckDev/a11y-witness.git $env:USERPROFILE\a11y-witness
```

Then run the provisioning script; it does the remaining nine steps and verifies each:

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
| `ForegroundLockTimeout = 0` | Edge must be able to take focus | empty/partial captures |
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
curl http://<worker>:8765/health              # -> {"ok":true,"screenReader":"NVDA","busy":false}

# 2. can it capture at all?
curl -X POST http://<worker>:8765/capture -H 'content-type: application/json' \
  -d '{"url":"https://example.com","steps":20}'

# 3. full capture regression (6 real captures, ~5 min).
#    MUST run in the console session -- via a scheduled task, not bare SSH.
node src/capture/nvda/capture-check.mjs
```

`capture-check` asserts that probes **fired**, not what they heard, so it can pass
while the evidence is garbage. Always eyeball the probe values too — this is the
signal the product depends on:

| fixture | healthy `after` value |
|---|---|
| `disclosure-good` | `"expanded"` |
| `disclosure-bad` | `""` |
| `forms-validation-good` | `"There is a problem. Email address is required."` |
| `forms-validation-bad` | `""` |

If good and bad look **identical**, the Speech Viewer is on. That is the tell.

## Debugging: error string → real cause

The error text is often actively misleading. This table is the shortcut.

| What you see | What it actually means | Fix |
|---|---|---|
| `Timed out waiting for NVDA to be running`, and **no `nvda.log` anywhere** | the install is a stub — payload deleted, `nvda.exe` launches and dies | reinstall NVDA (Layer 4) |
| `NVDA not installed` | **rarely** a missing install. Thrown by `NVDAClient.connect` when the speech-channel cert is absent — usually guidepup too old for this NVDA | upgrade guidepup ≥0.29.2 |
| `NVDA is not supported` | `getNVDAInstallationPath()` found nothing at guidepup's cache path | `npx @guidepup/setup install nvda` from the repo |
| 0 phrases, `afterStart.lastSpoken` empty, no error | NVDA is running but not speaking: no interactive desktop, or a modal dialog is freezing the session | log in at the console; dismiss the dialog *on the console* — it never surfaces over SSH |
| every probe `after` is `"NVDA Speech Viewer"` | Speech Viewer enabled; probes record that window, not the page | patch `nvda.ini` |
| phantom `"Welcome to Microsoft Edge"` / `"Sign in to sync data"` | fresh Edge profile; quick-nav escaped an empty document into browser UI | Edge policies + durable profile dir |
| `/health` refused, SSH fine | worker not started (task has no trigger), or firewall/IP changed | `Start-ScheduledTask -TaskName a11ysrv` |
| `npx.ps1 cannot be loaded ... scripts is disabled` | execution policy blocks the PowerShell shim | call `'C:\Program Files\nodejs\npx.cmd'` |

`afterStart.lastSpoken` in the response `diagnostics` is the single highest-value
field: if it is empty **and** every read is empty, the problem is the session, not
your code. (Empty `lastSpoken` alongside a full transcript is normal.)

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
