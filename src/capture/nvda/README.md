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
