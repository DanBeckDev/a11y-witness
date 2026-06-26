# NVDA capture worker (Windows)

The proven recipe for driving **real NVDA** through a real browser and capturing
what it announces. This is the spike that proved the capture half of the core
bet (see `../../../docs/adr/0001-capture-architecture.md`). It is not yet the
productionised HTTP-service worker; it is the manual recipe that the bootstrap
script and Packer image will encode.

## What runs where

The capture **must run in an interactive desktop session** — NVDA is a GUI app
and needs a real desktop, a foreground browser window, and focus. A bare SSH
session has no interactive desktop, so launching the capture directly over SSH
produces empty announcements. We run it via a Scheduled Task with
`LogonType Interactive`, which executes in the logged-on user's session.

## One-time setup on the VM

Windows 11, an admin user logged into the console (so there is an interactive
session), reachable over SSH.

```powershell
# Node, Git (NVDA itself is optional: Guidepup manages its own portable copy)
winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements

# Project + deps
git clone https://github.com/DanBeckDev/a11y-witness.git
cd a11y-witness; npm install

# Guidepup installs a portable NVDA and records it in HKCU\Software\Guidepup\Nvda,
# and zeroes ForegroundLockTimeout so the browser can take focus during capture.
npx --yes @guidepup/setup
```

> Note: `@guidepup/setup` installs the portable NVDA under `%TEMP%` by default.
> For a durable worker, pin it: `npx @guidepup/setup --nvda-install-dir C:\guidepup-nvda`.

## Running a capture (in the interactive session)

`run-capture.cmd <url>` runs `capture.mjs`, which launches Edge maximized, starts
NVDA, reads the page in browse mode (`nvda.next()`), and writes `transcript.json`.
Trigger it as an interactive scheduled task:

```powershell
$action = New-ScheduledTaskAction -Execute "C:\Users\<user>\a11y-witness\src\capture\nvda\run-capture.cmd" -Argument "https://example.com"
$principal = New-ScheduledTaskPrincipal -UserId "<user>" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName "a11ycap" -Action $action -Principal $principal -Force
Start-ScheduledTask -TaskName "a11ycap"
```

Then collect `transcript.json` and feed it to the judge on the control plane:
`npx tsx src/spike/judge-file.ts transcript.json "<the user's task>"`.

## Gotchas learned the hard way

- **Interactive session is mandatory.** Over plain SSH, NVDA announces nothing.
- **Browser focus + timing.** Launch the browser maximized and wait ~12s before
  `nvda.start()`, or NVDA reads an empty/unfocused context.
- **Read the current item first.** `nvda.next()` moves *then* reads, so capture
  `itemText()` once at the top or the first heading is skipped.
- **Stop at the bottom.** "Read next" re-announces the last item forever on short
  pages; stop after a few identical consecutive phrases.
- **OpenSSH via Windows Update can hang.** Installing OpenSSH with
  `Add-WindowsCapability` may stall on Windows Update; installing the
  Win32-OpenSSH release from GitHub is the reliable path.
- **Focus the browser window explicitly — the #1 flakiness fix.** Do NOT rely on
  the launched browser taking the foreground. Call Guidepup's
  `windowsActivate("msedge.exe", "Edge")` before `nvda.start()`, or captures come
  back empty/partial. Use `windowsQuit` to close cleanly. This was a root cause
  of flaky captures.
- **A modal dialog silently freezes the session.** A whole-capture outage (0
  phrases even on a known-good page) was a Windows permission dialog blocking the
  interactive session, not an NVDA fault. Accept it on the console; it will not
  surface over SSH. The structured diagnostics (`afterStart.lastSpoken` empty +
  every read empty with no error) are what pinpointed it.
- **Do not manually `taskkill nvda.exe`.** Let Guidepup own NVDA's lifecycle via
  `nvda.start()` / `nvda.stop()`; killing it out from under Guidepup destabilises
  the speech-capture channel.
- **Suppress Edge's first-run experience on a fresh profile.** A brand-new Edge
  profile shows a welcome/sign-in surface despite `--no-first-run`. On a page
  with no headings (or no controls), NVDA quick-nav escapes the empty document
  into that browser UI and records it as a phantom element ("Welcome to
  Microsoft Edge…", "Sign in to sync data"). Set the documented Edge policies
  before capturing: `HideFirstRunExperience=1` and `BrowserSignin=0` under
  `HKLM\SOFTWARE\Policies\Microsoft\Edge`. An established profile (like a
  long-used VM) doesn't show it, which is why this only bit a fresh CI runner —
  see `.github/workflows/capture-regression.yml`.
- **Operate controls in place during the form-field sweep.** A separate
  next/previous sweep to find a control fails on sparse pages: after the
  structural sweep the cursor sits at the end, so "next form field" returns
  nothing — the only control is the *current* position. Activate via the sweep's
  on-item callback instead. (Also: NVDA's "B" button quick-nav misses plain
  `<button>`s that "F"/form-field nav reaches.)
- **Capture the `spokenPhraseLog` delta, not just `lastSpokenPhrase`, after
  activating something.** A live-region alert (e.g. a form error) is often
  immediately followed by a focus move or document re-announce that overwrites
  `lastSpokenPhrase`, hiding the alert. Snapshot the log length before, then take
  everything announced after.

## Guidepup API reference

The authoritative API is the Guidepup docs, not the bundled `.d.ts`:
[intro](https://www.guidepup.dev/docs/intro),
[NVDA class](https://www.guidepup.dev/docs/api/class-nvda),
[Guidepup class](https://www.guidepup.dev/docs/api/class-guidepup).
Methods we rely on: `nvda.start/stop`, `next/previous` (arrow read), `perform(command)`
(quick-nav via `keyboardCommands`, e.g. `moveToNextHeading`/`moveToPreviousHeading`,
no `moveToTop`), `press(key)` (key on the focused control, e.g. "Tab"/"Space"/"Control+Home"),
`act` (Enter on the focused item), `lastSpokenPhrase`/`spokenPhraseLog`. For NVDA,
`itemText` equals `lastSpokenPhrase`. Top-level helpers: `windowsActivate`, `windowsQuit`.

## Portable NVDA: caveats (from the official NVDA user guide)

Guidepup installs and drives a **portable** copy of NVDA. Per the
[official NVDA user guide](https://download.nvaccess.org/releases/2026.1.1/documentation/userGuide.html#NavigatingWithNVDA),
portable/temporary copies have restrictions, notably **no browse mode in Windows
Store (UWP) apps**. We drive **desktop (Win32) Edge**, where browse mode works
(every capture confirms it), so this does not affect us — but the worker must
**not** be pointed at a UWP/Store-app browser, where the read-through would be
empty.

Also: `@guidepup/setup` installs the portable NVDA under `%TEMP%` by default,
which the OS may clean. For a durable worker, pin it with
`npx @guidepup/setup --nvda-install-dir C:\guidepup-nvda`.

Navigation model (same guide): NVDA has **browse mode** (single-letter quick-nav
by element type — h headings, d landmarks, f form fields, etc.), **focus mode**
(keystrokes go to the control; toggle with **NVDA+Space**), and **object
navigation**. The structural passes use browse-mode quick-nav; operating
controls (Layer 2 part 2) will use focus mode.

## Sample output

`../../spike/fixtures/nvda-w3c-bad-before.json` is a real capture of the W3C WAI
"Before" (deliberately inaccessible) demo. It audibly contains the real defects:
unlabelled graphics, "Click here" links, and visual headings not marked up as
headings.
