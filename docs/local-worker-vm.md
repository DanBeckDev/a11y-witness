# A local NVDA worker on your own machine

Capture needs a real Windows desktop, so the worker has always lived on a separate
box. That is a bad debugging loop: a broken capture means a round trip to a machine
you may not have with you, and validating through CI costs ~10 minutes per attempt.

This is how to run the worker **locally**, and how to hand a ready-made one to
everyone else so they never do the setup at all.

For what to do when a worker misbehaves, see
[`nvda-worker-runbook.md`](./nvda-worker-runbook.md). This document is only about
getting one onto your desk.

## The good news on Apple Silicon

NVDA runs **natively on Windows ARM64** — the build Guidepup installs ships ARM64
binaries (`nvda\lib\<version>\arm64\nvdaHelperRemoteLoader.exe`), and Edge and Node
both have native ARM64 Windows builds. So a Windows 11 ARM64 VM on an M-series Mac
runs the whole pipeline natively, with no x86 emulation in the path.

What does **not** work, so you can stop looking: Windows containers (Docker/colima)
are headless, with no desktop and no audio stack, so NVDA cannot run in them at all.
That is the constraint behind [ADR 0001](./adr/0001-capture-architecture.md), and no
amount of container plumbing gets around it.

> Audio is a non-issue: Guidepup reads speech over NVDA's Remote Access channel on
> `127.0.0.1:6837`, not from an audio device. The long-standing Proxmox worker has no
> sound device at all. Don't chase audio problems.

## Path A — scripted, no GUI clicking

```bash
./packages/worker-fleet/src/local-worker/fetch-windows-iso.sh              # official Win11 ARM64 ISO (~10 GB dl)
./packages/worker-fleet/src/local-worker/build-vm.sh <the-iso>             # builds support.iso (unattend + drivers)
./packages/worker-fleet/src/local-worker/create-utm-vm.sh <the-iso>        # creates + starts the VM in UTM
```

The third script is the one that took some finding. `utmctl` has no `create`
subcommand, which is why every guide online tells you to click through UTM's wizard —
but UTM's **AppleScript interface does support creation**:

```applescript
make new virtual machine with properties {backend:qemu, configuration:{…}}
```

The `qemu configuration` record is defined in
`/Applications/UTM.app/Contents/Resources/UTM.sdef` and accepts `architecture`,
`machine`, `memory`, `cpu cores`, `hypervisor`, `uefi`, `drives`, `network interfaces`,
`displays` and `qemu additional arguments`. That is enough to build the whole machine
from a shell.

Two wrinkles the script handles for you:

- **UTM converts an ISO given as `drives → source` into a qcow2 and attaches it as a
  fixed `Disk`.** The sdef's `removable` property is read-only, so you cannot ask for a
  CD at creation time. Windows Setup will not read `autounattend.xml` off a fixed disk,
  and the `windowsPE` ARM64 driver injection depends on that medium — so the script
  rewrites those two drives to `ImageType: CD, ReadOnly: true` directly in
  `config.plist`, and reclaims the ~4.5 GB of duplicated qcow2.
- **UTM caches configurations in memory**, so it must be quit before `config.plist` is
  edited and relaunched afterwards.

Then, on the host:

```bash
curl http://127.0.0.1:8765/health
A11Y_WORKER=http://127.0.0.1:8765 npm run witness -- https://example.com --task "..."
```

Budget ~1.5–2 h, almost all of it downloading. What the three scripts do:

**`fetch-windows-iso.sh`** assembles an official ISO via UUP dump — Microsoft's own
update packages, fetched from Microsoft's servers and assembled locally, because the
ARM64 ISO download page is a session-token web flow that does not script. It needs
five tools; four come from homebrew, and `chntpw` is not in homebrew-core at all, so
the script shims the universal build bundled inside CrystalFetch.app. That binary is
signed against its bundle and dies with SIGTRAP (exit 133) unless the bundle's
`OpenSSL.framework` is on the framework path — the shim exists for exactly that.

**`build-vm.sh`** downloads UTM's guest-tools ISO for the **ARM64 virtio drivers**,
builds a support ISO (unattend file + drivers + bootstrap), creates the qcow2 disk and
UEFI vars, and writes `run.sh`.

**`create-utm-vm.sh`** creates the VM through UTM's scripting interface, converts the
ISOs to CD-ROMs, and starts it. `autounattend.xml` then partitions the disk, installs
Windows 11 Pro, creates a local admin, **enables auto-logon**, and at first logon
installs the guest tools and runs the worker bootstrap — which installs Node, Git and
OpenSSH, clones the repo and runs `provision-nvda-worker.ps1`.

`build-vm.sh` also emits a `run.sh` for driving plain QEMU directly. That path is useful
for headless screenshots via the QEMU monitor, but it has not been shown to boot Windows
here — see the correction below.

> ### ⚠️ The thing that will waste your day: the ISO is not UEFI-bootable
>
> UUP dump's `convert.sh` builds the ARM64 ISO with
> `mkisofs -b efi/microsoft/boot/efisys.bin`, but **`-b` registers a BIOS boot image**
> (platform `0x00`). A UEFI entry needs platform `0xEF`. The result is a disc with no
> bootable UEFI record: firmware correctly declines it and falls through to the EDK2
> UEFI Shell. With no view of the guest console that is indistinguishable from a hang.
>
> Check any ISO before blaming your hypervisor:
> ```bash
> xorriso -indev <iso> -report_el_torito plain | grep 'boot img'
> #   want: El Torito boot img : 1  UEFI  ...
> #   bad:  El Torito boot img : 1  BIOS  ...
> ```
> `fetch-windows-iso.sh` now detects this and rebuilds the ISO with
> `mkisofs -eltorito-platform efi`, also swapping `efisys.bin` for
> **`efisys_noprompt.bin`** — the default image stops at "Press any key to boot from CD
> or DVD" and gives up if nobody presses one, which is fatal for an unattended install.
>
> `xorriso` cannot do the rebuild: `xorriso -as mkisofs` rejects `-udf`, and UDF is
> required because `install.wim` is >4 GB. cdrtools `mkisofs` supports both `--udf` and
> `-eltorito-platform`.
>
> **Correction worth recording:** this was first misdiagnosed as
> "homebrew QEMU + HVF cannot boot Windows 11 ARM64 on M4", citing
> [qemu#2893](https://gitlab.com/qemu-project/qemu/-/issues/2893). That was wrong. A
> BIOS-only El Torito record would not boot under *any* firmware, so plain QEMU was
> almost certainly failing for this same reason. `create-utm-vm.sh` uses UTM because it
> is scriptable and known-good, not because plain QEMU is proven broken — the `run.sh`
> that `build-vm.sh` emits may well work now against a fixed ISO, but that is untested.

> ### ⚠️ Use 23H2, not 24H2
>
> Windows 11 **24H2 Setup calls `SetupPrep.exe`** and is markedly stricter about
> `autounattend.xml` — it frequently ignores it entirely. Observed here: the installer
> boots correctly and then stops dead on "Select language settings", with the unattend
> file present at the root of both the install media and the support disc. This is
> widely reported (see the sources at the end of this document). 23H2 uses the classic
> Setup and honours the unattend file, so `fetch-windows-iso.sh` defaults to it
> (`A11Y_WIN_VERSION` overrides).
>
### Red herrings — do not repeat these

All of the following were tried against the un-bootable ISO and all failed identically,
because the disc had no UEFI boot record. Changing machine flags cannot fix that, so if
a VM will not boot, **check the ISO first** (`-report_el_torito`) before touching any of
this:

| Tried | Result |
|---|---|
| `highmem=on` (default) | 100% CPU, no progress |
| `highmem=off` | won't start at all — HVF caps addressing at 32 bits, RAM must be ≤2.5 GB |
| `highmem-ecam=off,highmem-mmio=off` | reaches firmware, then idles at 0% CPU |
| `gic-version=3` (+ low PCI windows) | 100% CPU, no progress |
| ISO via `usb-storage` vs `nvme` | identical either way — storage transport was never the cause |

One genuine finding from that dead end: UTM's QEMU **cannot** be borrowed for a plain-CLI
flow. It ships as a dlopen'd framework (`qemu-aarch64-softmmu.framework`), not an
executable, so invoking it directly gives `exec format error`. Hence driving UTM itself
via AppleScript rather than trying to reuse its binary.

### Three details that make this work at all

- **ARM64 virtio drivers.** Windows 11 ARM64 has **no inbox virtio-net driver**, so
  without injecting `NetKVM\w10\ARM64` at the `windowsPE` pass the installed OS has no
  network and cannot fetch Node, Git or NVDA. UTM's guest-tools ISO is the source of
  those drivers, and its own `Autounattend.xml` is where the ARM64 driver paths and the
  `LabConfig` TPM/Secure-Boot bypasses come from. The system disk is deliberately
  **NVMe**, not virtio-blk, because Windows has an inbox NVMe driver and therefore
  needs no injection to see the disk at all.
- **Auto-logon is mandatory, not a convenience.** NVDA is a GUI app that needs a
  logged-on interactive desktop. Without auto-logon the worker is dead after every
  reboot until a human logs in, and captures come back empty *with no error*.
- **No UAC prompt may ever appear.** UAC dialogs render on the secure desktop, which
  automation cannot click and NVDA cannot read. Provisioning gets its elevation from a
  `RunLevel Highest` scheduled task, which elevates silently. Note we do **not** copy
  UTM's `EnableLUA=false`: the pipeline depends on NVDA and Edge sharing an integrity
  level, and turning UAC off changes that relationship.

### The serial console is your best debugging tool

A UTM QEMU VM gets a serial PTY, and **EDK2 mirrors its console to it** — so you get
full read/write text access to the firmware before any OS exists. This is what made the
diagnosis above possible; without it you are staring at a black rectangle guessing.

```bash
osascript -e 'tell application "UTM" to get address of serial port 1 of virtual machine id "<uuid>"'
#   -> /dev/ttys010
```

Open that PTY in raw mode, write a command followed by `\r`, and read the reply (there is
a small helper pattern in the session notes; `screen /dev/ttys010` works interactively).
Useful firmware commands:

| | |
|---|---|
| `map -r` | rescan and list filesystems — shows whether each disc was even readable |
| `ls FS1:\efi\boot\` | confirm a loader exists where firmware would look |
| `FS1:\efi\microsoft\boot\cdboot.efi` | run the loader by hand and see its actual complaint |

Two things this revealed that were invisible otherwise: the "Press any key to boot from
CD or DVD" prompt, and that our `mkisofs`-built support ISO had **no `FS` alias at all**
(EDK2 reads UDF but not plain ISO9660, so firmware could not read that disc — harmless,
since only Windows needs to).

> **`input keystroke` does not work before an OS is installed.** It routes through the
> SPICE guest agent, so the text silently never arrives. Only `input scan code` (raw PC
> AT codes) reaches the emulated keyboard. Symptom: Enter produces new shell prompts
> while your typed text never appears.

### Reading files out of the guest (the channel that actually solved things)

Once the guest tools are installed, `qemu-ga` is running and UTM exposes file transfer.
This is the single most useful debugging tool here, because it turns "I can't see what's
happening" into "read the log":

```bash
utmctl file pull <uuid> 'C:\a11y-first-boot.log'      # bootstrap + provisioning output
utmctl file push <uuid> 'C:\fixed.ps1' < local.ps1    # patch a script without a rebuild
```

Two gotchas:

- **`utmctl exec` returns only the exit code, not stdout.** Redirect to a file in the
  guest and pull it. It also runs as **SYSTEM in session 0**, so anything that must land
  in the user's desktop session (or write to the user's `HKCU`) has to go through a
  scheduled task with `-UserId <user> -LogonType Interactive -RunLevel Highest`. Register
  the task under the wrong identity and provisioning produces a worker task with no
  interactive desktop, which means NVDA announces nothing.
- **A live log is locked.** `copy /y C:\the.log C:\snap.txt` in the guest first, then pull
  the copy, or you get "being used by another process".
- **`file push` into a directory that does not exist silently succeeds and writes
  nothing.** Create the directory first (via a pushed `.cmd`, since `exec` mangles
  quoting) and verify by pulling the file back.

### Which Windows Setup screen you land on tells you what broke

Setup fails in two distinguishable ways, and the screen is the fastest triage available
without reading `setupact.log`:

| Where it stops | What it means |
|---|---|
| **Language / region page** | the answer file was **rejected or never found** — bad schema, or a UI language the media does not carry |
| **Any later page** (edition picker, disk) | the answer file was **accepted**; one specific setting did not resolve |

Both of ours were content bugs that look identical to "file not found": locales set to
`en-GB` on `EN-US` media, and `/IMAGE/NAME` matched against the WIM's *Description*
rather than its *Name*. `fetch-windows-iso.sh` now fails the build on both.

### Getting eyes on a headless VM

`run.sh` runs with `-display none` plus a QEMU monitor socket, so you can screenshot
the guest at any point — invaluable when an unattended install misbehaves:

```bash
brew install socat
echo "screendump ~/a11y-worker-vm/shot.ppm" | socat - unix:$HOME/a11y-worker-vm/monitor.sock
sips -s format png ~/a11y-worker-vm/shot.ppm --out ~/a11y-worker-vm/shot.png
```

There is also a VNC server on `127.0.0.1:5901`, and a QMP socket. Once the guest tools
are installed, `qemu-ga` is running, so QMP `guest-exec` gives you a command channel
into the guest even before SSH works.

> **SSH key auth on Windows has one trap that wastes everybody's afternoon:** for an
> account in the Administrators group, sshd ignores `~/.ssh/authorized_keys` and reads
> `C:\ProgramData\ssh\administrators_authorized_keys` instead.

> **The VM's password is in a checked-in file** (`autounattend.xml`). That is only
> acceptable because QEMU user-mode networking NATs the guest and the launch script
> forwards just two ports, both bound to `127.0.0.1`. Do not bridge this VM.

## Path B — build once, distribute the image (the actual answer for a team)

Nobody should do Path A more than once. The provisioned VM is a self-contained folder:

```
~/a11y-worker-vm/          disk.qcow2, efi-vars.fd, support.iso, run.sh
```

Copy it to an external drive or a share; another Apple Silicon Mac needs only
`brew install qemu`, then `./run.sh`. Before exporting:

- Shut the VM down cleanly (not suspended — a saved-state image is bigger and less
  portable).
- Reclaim space first, or the image is needlessly large: `Optimize-Volume -DriveLetter C
  -Defrag -SlabConsolidate`, delete `%TEMP%`, then zero free space with Sysinternals
  `sdelete -z C:`. Expect **~30–40 GB**, or nearer 20 GB after zeroing and qcow2
  compaction.
- **Leave Windows unactivated.** An unactivated Windows 11 is fully functional for
  this purpose (a desktop watermark and some personalisation lockouts, none of which
  touch NVDA, Edge or Node). Activating it and then copying the image between machines
  invites reactivation prompts.

Two things make the image genuinely portable, both now fixed in this repo:
`run-server.cmd` / `run-capture.cmd` derive their paths from their own location rather
than a hardcoded `C:\Users\borem\...`, and `provision-nvda-worker.ps1` resolves the
account via `WindowsIdentity` instead of `$env:USERDOMAIN` (which is literally
`WORKGROUP` on a non-domain machine, and fails SID lookup with `0x80070534`).

Because the account inside the image is always `witness`, a recipient does not even need
to re-provision — but running `scripts/provision-nvda-worker.ps1` again is harmless and
is the way to repair anything that has drifted.

The image is ARM64 Windows: portable to any Apple Silicon Mac, **not** to an x86 host.

## Other hypervisors

Given the QEMU blocker above, this is currently the working route.

| | |
|---|---|
| **UTM** | Free. Its QEMU is patched for Windows-on-ARM, which is what makes it boot where brew's QEMU does not. `utmctl` cannot *create* a VM, but it can `start`/`stop`/`exec`/`ip-address` one, so only creation is manual. |
| **Parallels Desktop** | Paid, installs Windows 11 ARM in roughly one click. Shortest route if your time is worth more than the licence. |
| **VMware Fusion** | Free for personal use; needs the same ISO. |

### UTM, keeping the automation

The ISO and `support.iso` from the scripted path are exactly what UTM needs, so the
Windows install is still hands-off:

1. `./packages/worker-fleet/src/local-worker/fetch-windows-iso.sh` — build the ISO (works; unaffected).
2. `./packages/worker-fleet/src/local-worker/build-vm.sh <iso>` — still worth running: it produces
   `~/a11y-worker-vm/support.iso`, which carries `autounattend.xml`, the ARM64 virtio
   drivers and the bootstrap.
3. In UTM: **Virtualize → Windows**, uncheck "Import VHDX", select the Windows ISO.
   Give it 4 CPUs / 8 GB / 64 GB.
4. Before first boot, add a **second CD/USB drive** pointing at `support.iso`. This is
   the step that keeps the install unattended — Windows Setup reads `autounattend.xml`
   from the root of removable media, and the ARM64 `NetKVM` driver injection depends on
   that medium being present at the `windowsPE` pass.
5. Boot. The install should complete, auto-log in as `witness`, and run the bootstrap
   with no interaction.
6. `utmctl ip-address <vm>` for the guest IP, then
   `A11Y_WORKER=http://<ip>:8765 npm run witness -- ...`

If you skip `support.iso` entirely, Windows Setup becomes interactive: click through it,
create a local admin (`Shift+F10` → `start ms-cxh:localonly` to dodge the Microsoft
account requirement), then run `scripts/bootstrap-windows-worker.ps1` in the guest —
it does everything from Node through to a verified worker.

## Running it day to day — `worker-ctl.sh`

A Windows guest is never really idle, so leaving it running costs you. `worker-ctl.sh`
wraps the lifecycle:

```bash
npm run worker:ctl -- up        # start or resume, then wait for /health
npm run worker:ctl -- pool      # every a11y-worker* VM, as JSON
npm run worker:ctl -- pool-up   # start them all
npm run worker:ctl -- pool-stop # release them all (~13 s for three)
npm run worker:ctl -- pause     # ~0.6% CPU, resume under a second
npm run worker:ctl -- stop      # nothing held, ~15 s to come back
npm run worker:ctl -- idle-pause 15   # pause after 15 min with no capture
```

`idle-*` polls the worker's own `busy` flag, so a capture in flight resets the clock.

**With more than one worker you should not need any of this.** A dataset run with neither
`A11Y_WORKER` nor `A11Y_WORKERS` set discovers every local worker, starts **as many as the host
can hold**, spreads cases across them, and **puts each one back as it found it** — stopped stays
stopped, and a VM you had already started is left running. It also checks each VM's `busy` flag
before releasing it, so a run never shuts down a worker another run has picked up. The `pool-*`
commands are for when you want to do it by hand.

### The pool is capped by host memory, not by how many VMs are registered

A worker VM costs the host **~7 GB, not the 4096 MB it is configured with** (`top -o mem`, which
agrees with `phys_footprint`). The extra is QEMU's own overhead on top of guest RAM that Windows
dirties and never gives back — there is no balloon driver. It is not accumulation: a VM sits at
6.8 GB ten minutes after boot and creeps only to ~7.6 GB over nearly two hours.

Over-committing does not merely slow a run, it **breaks captures**. With three guests up on a
36 GB Mac, the same page on the same worker took **44.5 s; with one guest, 27.4 s** — and the
swapped-out guests also produced `NVDA is running but not speaking` failures and `/health`
blackouts, a pattern that reads as the workers dying.

So the lease reads available memory and starts only what fits, leaving the rest stopped (their
correct resting state anyway). `npm run doctor` shows the verdict before you start:

```
OK  host memory  ~12185 MB available — room for 2 of 3 worker(s)
```

- `A11Y_MAX_WORKERS=N` overrides the cap when you know something the measurement does not.
- Availability is read from `vm_stat`, **never `os.freemem()`** — that reported 402 MB on a host
  with ~12 GB to give, because macOS counts compressed and inactive pages as used.
- If it cannot read the host it does not constrain the run: a broken diagnostic must not be the
  thing that shrinks the pool.
- The reading is noisy just after a VM shuts down, because macOS reclaims lazily — it can
  under-report for a minute or two, which costs parallelism but never correctness.
- **Your own tooling is on the same host.** A `npm test` or a browser competes with the guests.

That release used to be missing on the pooled path: the single-worker lease restored state,
the pool handed back a no-op, and a pooled run left every guest running indefinitely.
Measured figures and their caveats are in the script header; the two that matter:

- "Idle" CPU readings swing between 2% and 86% — Windows background work. Sample once and
  you will believe whatever you happened to catch.
- **`pause` gives back CPU, not necessarily memory.** One paused run settled to ~0.8 GB
  within 40 s; the next held ~4.5 GB for three minutes with 66% of host memory free.
  Reclaiming a suspended guest's pages is the host's call, not ours.

So `pause` for a short gap — instant resume, since the guest never rebooted — and `stop`
when you want the memory back for certain. `stop` is cheap: a capture immediately after a
cold start was verified working, disclosure state change included.

### The pipeline drives this for you

You rarely need `worker-ctl.sh up` by hand. Run the CLI with **no** `A11Y_WORKER` set and it
manages the VM itself:

```bash
npm run witness -- https://example.com --task "Find the contact details"
# Local worker VM 'a11y-worker' is stopped; bringing it up ...
#   ready after 12s: health includes the deployed code and worker-reported runtime versions
# ... report ...
# Shutting down the local worker VM ...
```

Measured: 88 s for that whole cycle from a stopped VM, of which only ~25 s is the VM
(12–15 s boot, ~10 s clean shutdown) — the rest is the judge. So the VM lifecycle is not
what makes a run slow, which is the argument for shutting it down every time. Boot time is
not a constant, mind: a later run took 81 s to reach /health on a busier host, which is why
`up` waits for health rather than a fixed delay.

The default is `restore`: put the VM back in the state it was found in. That needs no
configuration to be correct in every case, including the one that matters — a VM you had
already started is left running, so a run never pulls the floor out from under a session
you were using. Release also stands down if the worker reports `busy`, in case a second run
started a capture while the first was finishing.

| you want | do |
|---|---|
| the default | nothing; `--after restore` |
| always shut down | `--after stop`, or `A11Y_VM_AFTER=stop` |
| keep it warm between runs | `--after leave` |
| a remote worker, no VM management | `--worker http://host:8765` or `A11Y_WORKER=...` |
| the old behaviour (localhost:8765) | `A11Y_LOCAL_VM=0` |

Everything UTM-specific stays in `worker-ctl.sh`; `src/capture/local-vm.ts` only reads its
`json` output, so the control plane never learns about utmctl, bundles or bookmarks.

`npm run training:capture` uses the same lease (it runs under `tsx` so it can import the
TypeScript module), and it is the run that benefits most: long, unattended, and previously
guaranteed to leave the guest running afterwards.

Dataset capture has one extra trap, now handled. Its pages are served by a plain HTTP server
**on the Mac**, and the default base URL is `http://localhost:5050` — which from inside the
guest means the guest, where nothing is listening. The lease therefore exposes the host's
address on the VM's subnet (the gateway end of UTM's shared network, `bridge100`, found by
matching interfaces against the guest's own address rather than assuming `x.y.z.1`) and the
base URL is rewritten:

```
Dataset pages: rewrote http://localhost:5050 -> http://192.168.64.1:5050 (the guest cannot reach the host's localhost)
```

Verified end to end: 3 cases (6 captures) from a stopped VM in 207 s, returned to stopped,
with the transcripts carrying the real 1.1.1 contrast — `graphic, A shaded seating area
beside the community garden` for the good page against NVDA's missing-description prompt for
the bad one.

One thing `worker-ctl.sh` deliberately does *not* do is send `utmctl stop` bare. That
defaults to `--force`, a power-off event: from Windows' point of view the plug was pulled,
so every stop leaves a dirty volume. It sends `--request` (ACPI shutdown, ~10 s) and only
escalates if the guest ignores it.

### A fresh install cannot capture until it has rebooted once

Observed on two independent clean builds: provisioning finishes, `/health` answers
`{"ok":true,"screenReader":"NVDA"}`, NVDA connects — and every read returns **0 phrases
with no error anywhere**. One reboot fixes it permanently.

It is *not* `ForegroundLockTimeout`, which is the reflex diagnosis for a silent 0-phrase
capture. On the build where it failed, both logs said otherwise:

```
provisioning: OK ForegroundLockTimeout: 2147483647 -> 0 (applied to this session)
server.log:      ForegroundLockTimeout: 0 -> 0 (applied to this session)
```

...and the very next capture in that same session still returned 0 phrases; after
`shutdown /r`, the same capture returned 2. Something else about the first-logon session is
responsible — guest-tools drivers settling, or first-logon shell state holding the
foreground — and it has not been pinned down. `bootstrap-windows-worker.ps1` therefore ends
by rebooting; auto-logon plus the at-logon task bring the worker back on their own.

### `utmctl` says the VM is `unknown` and the worker is unreachable

`utmctl` is a client for the **UTM app**, not a standalone daemon. If UTM is not running it
cannot answer, and the symptoms point the wrong way: the bundle is present and intact, but the
VM's state comes back `unknown` (or the command fails), which reads as a corrupted or missing
guest. `worker-ctl.sh` now launches UTM and waits for it before doing anything, and prints
what `unknown` actually means when it sees it.

Check in this order:

```bash
pgrep -x UTM              # utmctl needs this
pgrep -f QEMULauncher     # is a guest actually running?
utmctl list               # is the VM registered, and under what UUID?
npm run worker:ctl -- status
```

**Two shells or two agents driving one worker will produce exactly this confusion.** There is
one VM and one NVDA on this machine, so a second party stopping, restarting or rebuilding the
worker makes the first one's view wrong — a VM reported as `unknown` mid-restart, or a worker
unreachable for a minute while its scheduled task comes back. It is the same single-shared-
resource problem as running `capture-check` against a live worker. Before concluding the guest
is broken, check nothing else is mid-operation on it; `worker-ctl.sh status` is the cheap way
to ask.

### Bundles exist but `utmctl list` is empty

This is different from a stopped pool. If the `a11y-worker*.utm` directories are present but
`utmctl list` prints only its header, the guests are intact but UTM has lost their registrations.
Do not run `create-utm-vm.sh`, clone a replacement, or delete anything. UTM's AppleScript
interface can import an existing bundle without recreating the guest:

```bash
osascript \
  -e 'tell application "UTM"' \
  -e 'import virtual machine from file (POSIX file "/path/to/a11y-worker.utm")' \
  -e 'end tell'
```

Repeat for `a11y-worker-2.utm` and `a11y-worker-3.utm`, then verify with `utmctl list` and
`npm run worker:ctl -- pool`. Some UTM versions show a security confirmation
when an imported bundle contains custom arguments; an operator must approve that prompt in
UTM before the AppleScript call returns. The repository deliberately does not bypass that
confirmation or edit UTM's private registry while the app is running.

### Never `utmctl delete` a VM whose name appears twice

`utmctl list` can show two UUIDs with the same name, and **both point at the same bundle
directory**. Confirmed in UTM's own registry — two entries, one path:

```
"B317855F-..." => { "Name" => "a11y-worker", "Package" => { "Path" => ".../a11y-worker.utm" } }
"D2615973-..." => { "Name" => "a11y-worker", "Package" => { "Path" => ".../a11y-worker.utm" } }
```

So `utmctl delete` on *either* removes that directory and destroys the other VM's disk. The
aftermath is a start that fails with `The file "edk2-arm-vars.fd" doesn't exist`. This has
already cost one fully provisioned VM here. Resolving by UUID does **not** protect you —
the danger is the shared path, not the name lookup.

Remove the stale registration by editing UTM's registry instead, which never touches the
bundle:

```bash
PL=~/Library/Containers/com.utmapp.UTM/Data/Library/Preferences/com.utmapp.UTM.plist
STALE=<uuid-to-drop>
osascript -e 'tell application "UTM" to quit'   # UTM rewrites this file on exit
cp "$PL" "$PL.bak"
/usr/libexec/PlistBuddy -c "Print :VMEntryList:0" "$PL"    # confirm the index is the stale UUID
/usr/libexec/PlistBuddy -c "Delete :VMEntryList:0" -c "Delete :Registry:$STALE" "$PL"
killall cfprefsd    # or UTM reads the pre-edit copy straight back out of the cache
open -a UTM
```

Then check the bundle still has its `Data/*.qcow2`, `efi_vars.fd` and `support.iso` before
trusting it. `worker-ctl.sh` refuses to act at all while duplicates exist rather than
guessing which one you meant.

## Keeping a local worker in sync

The worker runs the repo from a clone, so `git pull` on the VM is part of the loop.
While iterating on `capture-core.mjs` specifically, it is faster to copy the single
file and restart the worker than to commit and pull:

```bash
scp src/capture/nvda/capture-core.mjs user@vm:C:/Users/user/a11y-witness/src/capture/nvda/
# Prefer a REBOOT over a task restart. Stop/Start-ScheduledTask silently fails to replace the
# running process when the guest agent is not ready, and two workers once served stale code for
# an hour that way. `worker-ctl.sh stop && up` always picks up a pushed file, and
# `npm run worker:code` proves it did.
ssh user@vm "powershell -NoProfile -Command \"Stop-ScheduledTask -TaskName a11ysrv; Get-Process node -EA SilentlyContinue | Stop-Process -Force; Start-ScheduledTask -TaskName a11ysrv\""
```

Verify the copy landed with a hash on both sides — a stale worker silently running old
code looks exactly like a logic bug, and costs far more time than the check:

```bash
shasum -a 256 src/capture/nvda/capture-core.mjs
ssh user@vm "powershell -NoProfile -Command \"(Get-FileHash 'C:\Users\user\a11y-witness\src\capture\nvda\capture-core.mjs' -Algorithm SHA256).Hash\""
```

Then re-validate with `node src/capture/nvda/capture-check.mjs` **in the VM's console
session** (via a scheduled task, not bare SSH — SSH has no interactive desktop).

## Sources

- [qemu#2893](https://gitlab.com/qemu-project/qemu/-/issues/2893) — "with m4 mac mini
  windows 11 arm 64 iso not booting" (open). Cited here originally as the cause of our
  boot failure; see the correction above — the real cause was the ISO's El Torito record.
- [qemu#797](https://gitlab.com/qemu-project/qemu/-/issues/797) — ARM64 HVF failing to
  boot Windows 11, same class of report.
- [Problem with Win11 24H2 using autounattend.xml](https://answers.microsoft.com/en-us/windowsclient/forum/all/problem-with-win11-24h2-using-autounattendxml/671b06d7-7a22-48c6-aebd-4fb3cb5a06b6) — Microsoft Q&A.
- [Windows 11 (24H2) autounattend.xml not loading](https://windowsforum.com/threads/windows-11-24h2-autounattend-xml-not-loading.342915/)
- [W11 24H2 ignores autounattend.xml](https://ntlite.com/community/threads/w11-24h2-ignores-autounattend-xml.4862/) — notes 24H2 Setup calling `SetupPrep.exe`.
- [Creating a UTM VM from CLI](https://blog.vkhitrin.com/creating-a-utm-virtual-machine-from-cli/) — `.utm` bundle layout.
- UTM's scripting dictionary: `/Applications/UTM.app/Contents/Resources/UTM.sdef` — the
  authoritative reference for `make new virtual machine` and the `qemu configuration` record.
