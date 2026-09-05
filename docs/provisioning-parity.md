# Does the role provision the same worker the script does?

Audit §9's provisioning row (`docs/architecture-audit.md`): `provision-nvda-worker.ps1` (810 lines) and
`roles/worker/` (1,369 task lines + 811 module lines) coexist "until parity is demonstrated." Parity was a
prose procedure (`ansible/README.md:60-76`) — provision one box each way, compare `/health.environment` and
`provisionRevision` by eye — with no test, no checklist, and no backlog entry. This is the measurement that
was missing, read from the actual task files and modules, not inferred from names or from the READMEs'
own summaries (both of which turned out to be stale in specific, checkable ways — see below).

## The three provisioning stories, not two

The comparison the audit named is `provision-nvda-worker.ps1` vs `roles/worker/`, and that framing hides a
real division of labour that changes what a "divergence" even means. There are three scripts, not two,
and they answer different questions about the SAME box's history:

| script | question it answers | status |
|---|---|---|
| `bootstrap-windows-worker.ps1` | a truly bare Windows install, before Ansible can reach it at all: install Node/Git, clone the repo, get SSH working | **admits its own immaturity** — its header says *"this script has NOT yet been run end-to-end on a fresh Windows install... expect to babysit it"* |
| `provision-nvda-worker.ps1` | NVDA, Edge policy, power, the scheduled task — everything specific to a capture worker, assuming Node/Git/the repo/SSH already exist | the "tested part," per bootstrap's own comment |
| `roles/worker/` | **both of the above, in one playbook** — it installs Node/Git and clones the repo (`packages.yml`) AND does everything `provision-nvda-worker.ps1` does |  |

So `packages.yml` installing Node and cloning the repo is not evidence the role does something the script
"lacks" — it is evidence the role folds two scripts' jobs into one, which is a reasonable design for a
PXE + `autounattend.xml` box that has genuinely nothing on it yet (root `CLAUDE.md`: *"a new box needs no
console visit"*). Comparing `provision-nvda-worker.ps1` alone against the whole role over-counts this
slice as a gap. The real comparison for Node/Git/account/auto-logon is **bootstrap vs. role**, and both use
the same Node-LTS-from-`nodejs.org` mechanism — bootstrap-windows-worker.ps1:144 and
`packages.yml`:24-36 both resolve `https://nodejs.org/dist/index.json` for the current LTS. Neither
hardcodes a version, so neither is more "pinned" than the other; both re-resolve LTS on every run.

**What follows from this**, and it matters for the decision below: `provision-nvda-worker.ps1` genuinely
assumes an already-bootstrapped box (Node, Git, the repo, SSH). The role does not need that assumption
because it starts from `autounattend.xml`'s zero-touch image. That is a difference in **which starting
state each path was built for**, not a bug in either.

## The parity table

Every row is read from the actual source — task file, module, or script line — never inferred from a
filename or a README's own summary of itself, both of which were caught stale (below).

### NVDA, guidepup, Speech Viewer, ForegroundLockTimeout

| concern | `provision-nvda-worker.ps1` | `roles/worker/` | same? |
|---|---|---|---|
| Guidepup version | resolved from the checkout's own `package.json` at `npm install` time (script does not hardcode one) | identical mechanism (`nvda.yml`: `npm install`, then asserts the installed manifest's version ≥0.29.0) | **SAME** — neither path pins guidepup; both ride whatever the checked-out `package.json` says |
| NVDA install | `npx --yes @guidepup/setup install nvda`, cached under `%LOCALAPPDATA%\guidepup`, verified ≥500 files + `library.zip` + `nvda_slave.exe` | `a11y_nvda` module runs the byte-identical command from the same cache root with the same integrity thresholds | **SAME** |
| Speech Viewer disabled | regex `showSpeechViewerAtStartup = True → False` across every `nvda.ini`, re-read to confirm, throws if any still say `True` | `a11y_speech_viewer` module: identical replace, identical re-read-and-fail; additionally fails loudly on **zero** `nvda.ini` files found (the script has no equivalent guard for that edge case) | **SAME setting, role stricter** |
| `ForegroundLockTimeout` | **two mechanisms**: (a) one-time at provisioning, via `apply-foreground-lock-timeout.ps1`'s `SystemParametersInfo` call plus a "belt and braces" `HKCU:\Control Panel\Desktop\ForegroundLockTimeout=0` registry write; (b) `run-server.cmd` re-applies the same script every session | **only (b)** — `nvda.yml` states outright it is a deliberate decision, not an oversight: SSH is a network logon, so the one-time call would report success while changing nothing | **DIFFERENT MECHANISM, LIKELY SAME EFFECT** — both scripts' own comments agree the one-time registry write alone doesn't reliably take effect; the box's actual live behaviour comes from `run-server.cmd` either way. Real, documented asymmetry: a role-provisioned box has no HKCU value declared until the worker first starts; a script-provisioned box has it declared immediately after provisioning |
| Other `nvda.ini` settings | only `showSpeechViewerAtStartup` | only `showSpeechViewerAtStartup` | **SAME** — neither writes `CAPTURE_SETTINGS`-class keys (e.g. `speech.reportLanguage`) at provisioning time; those are applied per-capture by the worker itself |

### Edge — version pin and policy

| concern | script | role | same? |
|---|---|---|---|
| Edge version pin | **NOTHING.** No version string, MSI, or SHA256 anywhere in the script. The box runs whatever build the base image shipped with | `worker_edge_version: "152.0.4191.66"` (`defaults/main.yml`), installed from a SHA256-verified enterprise MSI, verified from the **binary itself** after install (`edge-version.yml`) | **TOTAL DIVERGENCE, and it is the one already named going in.** A script-only box has no pin at all |
| EdgeUpdate scheduled tasks/services | sets `UpdateDefault`/`AutoUpdateCheckPeriodMinutes` registry policy keys, which root `CLAUDE.md`'s own "THE BROWSER VERSION IS EVIDENCE TOO" section already documents as **never honoured on a non-domain-joined box** | stops and disables every `MicrosoftEdgeUpdate*` task (by prefix) and the `edgeupdate`/`edgeupdatem` services, then verifies | **DIFFERENT, and the script's mechanism is INERT.** A script-provisioned box's Edge will self-update on its own schedule; nothing the script does actually prevents it |
| `ComponentUpdatesEnabled` | absent | `0` in `defaults/main.yml`, comment cites measuring 353 MB of background component fetches on this fleet | **role-only**, a real but low-severity gap |
| Windows Update deferral | `NoAutoRebootWithLoggedOnUsers=1` | identical key/value | **SAME** |
| Notifications | `DisableNotificationCenter=1` | identical | **SAME** |
| OneDrive | registry keys + kill process + delete `HKCU` Run entries + `OneDriveSetup.exe /uninstall` | same two registry keys + separate Run-entry removal + a dedicated module for eviction | **SAME outcome, different mechanism** |
| Screensaver | `ScreenSaveActive`/`ScreenSaveTimeOut` = 0, HKCU (correctly un-`become`d) | identical | **SAME** |
| Seven shared Edge behaviour policies (`HideFirstRunExperience`, `BrowserSignin`, `BackgroundModeEnabled`, `StartupBoostEnabled`, the three Autofill/PasswordManager keys) | all seven present | all seven present, byte-identical values | **SAME** |
| UAC / blocking-dialog posture | reports `PromptOnSecureDesktop`, does not change it | same, does not change it | **SAME** |
| Firewall `NotifyOnListen` + worker-port inbound rule | `Set-NetFirewallProfile -NotifyOnListen False` (Domain/Private/Public) + inbound rule named `a11y-witness worker $Port`, profile **Any** | identical `NotifyOnListen` disable + inbound rule, same name format, profiles enumerated as domain/private/public explicitly | **SAME in substance** (`Any` vs. the three named profiles is not a real difference — "Any" already covers them) |
| SSH inbound firewall rule (port 22) | **absent** | present (`OpenSSH Server (a11y-witness)`, port 22) | **role-only, but not a real gap** — both provisioning paths themselves run *over* SSH, so the port is necessarily already reachable before either script starts; the role's rule is defensive re-statement, not a prerequisite either path depends on |

### Background trimming, power/NIC, browser profile, scheduled task, verify

| concern | script | role | same? |
|---|---|---|---|
| Windows Appx/service trim (`windows-trim.mjs`) | invoked explicitly at provisioning time (Step 7) | **no equivalent task anywhere in `roles/worker/`** | **DIFFERENT IN TIMING, NOT IN OUTCOME.** `server.mjs:135-142` runs the identical `windows-trim.mjs` in the background the first time the worker server itself starts ("once per guest"), regardless of which path provisioned the box. A role-provisioned box is trimmed at first boot of the worker service rather than during provisioning — same end state, later |
| Sleep/power plan | unconditional `powercfg /change standby-timeout-ac 0` / `hibernate-timeout-ac 0` / `disk-timeout-ac 0` / `/hibernate off` | `a11y_power_timeouts` module: same target values, reads current state first and only changes on real drift | **SAME end state**, role is idempotent-reporting |
| NIC power saving | `Set-NetAdapterPowerManagement -AllowComputerToTurnOffDevice Disabled`; registry **fallback** writes `PnPCapabilities 24` (disables power-down AND wake) | `a11y_nic_power` module: same primary setting, PLUS explicitly manages `WakeOnMagicPacket Enabled`/`WakeOnPattern`; its fallback writes `8` (power-down only), deliberately preserving Wake-on-LAN | **DIFFERENT, and the role is more correct.** On hardware where the cmdlet path is unavailable and the registry fallback fires, a script-provisioned box's fallback can silently disable Wake-on-LAN — the exact mechanism `fleet:wake` depends on — where the role's fallback preserves it by design (its own module comment names this risk) |
| Durable browser capture profile | creates `%LOCALAPPDATA%\a11y-witness\{edge,chrome}-profile`, honours `A11Y_BROWSER_PROFILE`/`A11Y_EDGE_PROFILE` overrides | creates the identical two directories, no override support | **SAME path**, script-only override convenience |
| Scheduled task (worker + `a11ycheck`) | `Register-ScheduledTask`: interactive logon, `RunLevel Limited`, `AtLogOn` trigger, `RestartCount 5`/`RestartInterval 1m`, no execution time limit, allowed on battery | `win_scheduled_task`: same logon type, same run level, same trigger, same restart policy, same battery flags; also removes the one-shot `a11ybootstrap` task | **SAME in every parameter checked** |
| Defender | checks Tamper Protection first, disables real-time monitoring only if it's off | `a11y_defender` module: identical logic, additionally re-reads after the change and fails loudly if Tamper Protection silently reverted it | **SAME logic, role verifies harder** |
| Final verify | starts the task, polls the port, polls `/health` | `verify.yml`: starts the task, `win_wait_for` on the port, polls `/health` from the control plane with the same retry shape, additionally asserts `readiness.checks.browser` is truthy | **materially SAME**, role is more explicit |
| `LimitBlankPasswordUse` guard | reads the key; **WARNS only** if it's off, and the script still reports success | reads the identical key; **HARD FAILS the whole play** if it's off, naming the exposure | **DIFFERENT SEVERITY — role is more correct.** A script-only fleet could carry a box with this protection off and never be told |

### `provisionRevision` — the measurement the whole "compare and see" procedure depends on

This is the single most consequential finding, because it is not about which path is more correct — it is
about whether the tool the README recommends for PROVING parity (`ansible/README.md:60-76`, step 3: "compare
`provisionRevision`") can actually see the differences that matter.

**Both paths call the exact same script.** This has already been unified — `stamp-provision-revision.ps1`
is invoked identically by `provision-nvda-worker.ps1` and by `roles/worker/tasks/bespoke.yml`. There is no
separate "hash the script" vs. "hash the role" split; `docs/architecture-audit.md`'s own §9 row describing
one is **stale**, in two specific ways, both verified directly against the script:

1. It says the stamp hashes **four** files. It hashes **five** — `a11y_speech_viewer.ps1` was added
   2026-09-05, recorded in the script's own header.
2. It says the hash covers "**not** the role's task files or modules." That is now false for one module:
   `a11y_speech_viewer.ps1` **is** a module, and it **is** hashed — added specifically because a Speech
   Viewer regression in that module "would leave the stamp unmoved, `fleet-consistency` reading the fleet
   as fine, and every capture silently unusable" (the script's own words).

**The actual hash list, verified by reading `stamp-provision-revision.ps1` directly:**

```
packages/worker-fleet/src/provisioning/provision-nvda-worker.ps1
packages/nvda-worker/src/run-server.cmd
packages/worker-fleet/src/provisioning/apply-foreground-lock-timeout.ps1
packages/control/ansible/roles/worker/defaults/main.yml
packages/control/ansible/collections/ansible_collections/a11y/worker/plugins/modules/a11y_speech_viewer.ps1
```

Because both provisioning paths run this identical script against this identical file list, **a
script-provisioned box and a role-provisioned box at the same commit produce the SAME `provisionRevision`**
— contrary to what a naive reading of "hashes the script for one path and `defaults/main.yml` for the other"
would suggest. Divergence between the two paths' actual configuration is real (Edge pin, NIC fallback,
LimitBlankPasswordUse severity — all documented above), and **provisionRevision cannot see any of it**,
because none of those live in the five hashed files except the Edge version STRING (which does live in
`defaults/main.yml`, and would move the stamp).

**The blind spot, stated precisely, because it is the reasoning the stamp's own header already uses for
Speech Viewer, not applied to five siblings:**

`defaults/main.yml` is hashed. The other **nine task files** (`main.yml`, `packages.yml`, `account.yml`,
`policy.yml`, `edge-version.yml`, `firewall.yml`, `nvda.yml`, `tasks.yml`, `bespoke.yml`, `verify.yml`) are
excluded by an explicit, argued design decision recorded in the stamp's own comment: *"they change when the
same settings are applied a different way... and keying on them would churn the cache for reasons that
never reach a capture."* That argument holds for a REFACTOR of how a setting is applied. It does not hold
for a **module** that reconciles real environment state — and five of the six `a11y.worker` modules
(`a11y_nvda.ps1`, `a11y_power_timeouts.ps1`, `a11y_nic_power.ps1`, `a11y_defender.ps1`,
`a11y_onedrive.ps1`) are exactly that, by the collection's own README: *"each one reads current state,
compares, and changes only the difference."* A bugfix to `a11y_nic_power.ps1`'s fallback — the exact one
this audit found, changing whether Wake-on-LAN survives — changes what the environment ends up as and
would **not** move `provisionRevision`. That is the identical shape the stamp was extended to fix for
Speech Viewer, unfixed in five more places.

**This is not something to patch in this unit** (`stamp-provision-revision.ps1` is itself hashed by
nothing, so changing it is a stamp move and a recapture, same as any other change to the file list) — it
is recorded here as the concrete, actionable item this audit produced, and it belongs on the backlog rather
than fixed as a side effect of measuring it.

## Divergences, and which direction each one is wrong in

| divergence | direction |
|---|---|
| Edge version pin | **script is behind.** No pin at all; the role's is correct and load-bearing (root `CLAUDE.md` treats Edge version as capture-cache evidence) |
| EdgeUpdate task/service disable | **script is behind**, and its existing mechanism (registry policy) is inert on these boxes for a reason this repo has already documented elsewhere |
| `ComponentUpdatesEnabled` | **script is behind** — role-only, low severity |
| NIC power fallback (Wake-on-LAN) | **script is behind** — its fallback can silently break `fleet:wake`'s mechanism; the role's does not |
| `LimitBlankPasswordUse` severity | **script is behind** — warns where the role correctly refuses |
| Speech Viewer zero-`nvda.ini` guard | **script is behind**, minor |
| `ForegroundLockTimeout` one-time write | **asymmetry, not a defect** — both rely on `run-server.cmd` for the effect that actually matters |
| `windows-trim.mjs` at provisioning time | **asymmetry, not a defect** — the worker server itself performs the equivalent at first boot either way |
| Node/Git/account/auto-logon "gaps" in the script | **not a real comparison** — that is `bootstrap-windows-worker.ps1`'s job on the script's side, and it uses the identical Node-LTS mechanism the role does |
| `provisionRevision`'s blind spot to 5 of 6 modules and all task files | **a defect in the shared measurement**, not attributable to either path — it affects a role-provisioned fleet's own internal consistency checking too, independent of the script entirely |

Nowhere does the audit find the **script** ahead of the role on anything that changes what a capture
observes. Every real divergence with observable consequences points the same way.

## The decision: is parity still the goal?

**No — not for the fleet.** The role is measurably more correct on every concern with real consequences
(Edge pin and its enforcement, the blank-password guard's severity, the NIC/Wake-on-LAN fallback, `--check`
safety, argument validation, structured diffs), and it is already the documented default path for
converging the whole fleet (`fleet:provision` in root `CLAUDE.md`). Chasing byte-for-byte parity with a
script that is behind on the very things measured to matter would mean either holding the role back to
match the script, or fixing the script to match the role feature-by-feature — reimplementing exactly the
second source of truth this repo's own rules exist to prevent.

**But "parity" was always asking the wrong question for what the script is actually for now.** Reading
`bootstrap-windows-worker.ps1`'s own comments makes this explicit: the true audience for
`provision-nvda-worker.ps1` was never "a fleet box with no Ansible" — that class is nearly empty today,
because `bootstrap-windows-worker.ps1` (for a hand-built box) and PXE + `autounattend.xml` (for the
zero-touch path, per root `CLAUDE.md`) both leave a box reachable by Ansible before `roles/worker/` would
ever need to run. The script's remaining real audience is the **single contributor building one local
worker VM** documented in `docs/getting-started.md` — someone with no inventory, no fleet, and no reason
to install Ansible collections for one machine. That is a genuinely different use case, not a weaker
version of the fleet one, and it is fine for it to diverge on fleet-specific concerns (a pinned Edge build
enforced across ten machines, Wake-on-LAN for a rack of always-off boxes) that a solo contributor's single
VM has no stake in.

**What this changes, concretely:**

- **`roles/worker/` (`provision-role.yml`) is the fleet path, full stop.** It should stop being described as
  "the newer path, pending proof of parity" and start being described as what it already is in practice.
- **`provision.yml` and `provision-nvda-worker.ps1` are no longer trying to be the fleet's provisioning
  path.** Their audience is the solo local-worker workflow, where they should be judged against
  `docs/getting-started.md`'s needs, not against the role's.
- **What retiring `provision.yml` from FLEET use would cost, precisely** (since the question was asked and
  the answer is already fully quantified, not hypothetical): `provisionRevision` hashes
  `provision-nvda-worker.ps1` itself, so deleting or repurposing it moves the stamp and invalidates the
  2,122 cached captures on disk — one recapture (measured at 3h46m across three workers), best bundled with
  any pending `CAPTURE_PROTOCOL_VERSION` bump so it is paid once. `run-server.cmd` and
  `apply-foreground-lock-timeout.ps1` are used every session by **both** paths regardless and would not go
  anywhere. Retiring the fleet-facing `provision.yml` playbook itself (not the script — the playbook that
  drives it against the ten-box inventory) additionally frees `normalise-fleet.mjs`, `guest-run.mjs`, and
  `guest/normalise-fleet.cmd` per `provision-role.yml`'s own header, since the role's `policy.yml` already
  replaces what the last of those does for bare-metal workers.
- **This unit does not do any of that.** Per the assignment: a full recapture is running right now, and
  moving `provisionRevision` today would invalidate it mid-run. This is the decision and the cost, recorded
  for whoever picks up the retirement — deliberately not executed here.

**What is NOT decided, and is recorded as open work instead of quietly dropped:** the `provisionRevision`
blind spot to five of six modules and all ten task files is a real gap in the shared measurement, separate
from the parity question, and worth its own backlog row rather than folding it into "parity is decided" —
fixing it means picking a defensible boundary (module vs. task file) and would itself move the stamp.
