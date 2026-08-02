/**
 * Take Windows' background furniture off a capture guest, so its memory goes to Edge and NVDA.
 *
 * ## Why this exists
 *
 * Measured on a real guest (`/diagnostics.topProcesses`), the workload is a rounding error next to the
 * operating system carrying it:
 *
 *   msedge.exe  218 MB   <- the browser
 *   nvda.exe    207 MB   <- the screen reader        = 425 MB of actual work
 *   svchost.exe 889 MB across 63 processes
 *   MsMpEng     254 MB   SearchHost 185 MB
 *   explorer    144 MB   StartMenu  107 MB   CrossDevice 74 MB
 *
 * Committed bytes for the whole guest is ~1,852 MB. That number is the reason this module matters:
 * host cost scales at ~1.8-2.0x *configured* guest RAM, so every 512 MB we can take off the guest's
 * ceiling is ~1 GB back on the host — but the ceiling cannot go below what the guest commits. Dropping
 * a stock guest from 4,096 MB to 2,560 MB was measured and it **failed**: phase time went from ~20 s to
 * ~45 s because Windows started paging. Trimming the OS is what makes a lower ceiling safe. The trim is
 * not the prize; it is the thing that unlocks the prize.
 *
 * ## Why it runs here rather than in an image build
 *
 * `nano11builder` and `tiny11builder` do this offline against a mounted WIM. Two problems: both delete
 * Edge and `LanguageFeatures-Speech`/`-TextToSpeech` — the browser we capture through and the `oneCore`
 * synth NVDA is configured to use — and both are x64/en-us, while these guests are ARM64. Adapting them
 * means owning an ISO pipeline.
 *
 * Everything here works on a live guest instead, through the one channel that is known reliable:
 * `worker:deploy` pushes the file, reboots, and verifies `/health.code` over HTTP. `utmctl exec` is not
 * usable — it returns success and no output whether or not it ran.
 *
 * ## The safety property
 *
 * A guest that loses Edge or the speech stack is not a slow guest, it is a dead one, and it would fail
 * in a way that looks like the NVDA faults this project has already spent days on. So removal is an
 * explicit allow-list intersected with an explicit deny-list, `KEEP_PATTERNS` wins over
 * `REMOVABLE_APPX`, and that precedence is the first thing the tests assert.
 */

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

/**
 * Provisioned Appx packages that may be removed. Taken from nano11builder's list, minus anything this
 * project touches. These are the background apps that register startup tasks and keep RuntimeBroker
 * resident; none of them is reachable from a capture.
 */
export const REMOVABLE_APPX = [
  "Clipchamp.Clipchamp",
  "Microsoft.BingNews",
  "Microsoft.BingWeather",
  "Microsoft.GamingApp",
  "Microsoft.GetHelp",
  "Microsoft.Getstarted",
  "Microsoft.MicrosoftOfficeHub",
  "Microsoft.MicrosoftSolitaireCollection",
  "Microsoft.People",
  "Microsoft.PowerAutomateDesktop",
  "Microsoft.Todos",
  "Microsoft.WindowsAlarms",
  "microsoft.windowscommunicationsapps",
  "Microsoft.WindowsFeedbackHub",
  "Microsoft.WindowsMaps",
  "Microsoft.WindowsSoundRecorder",
  "Microsoft.Xbox.TCUI",
  "Microsoft.XboxGameOverlay",
  "Microsoft.XboxGamingOverlay",
  // nano11builder also removes Microsoft.XboxSpeechToTextOverlay. It is deliberately NOT here: the
  // name matches the `speech` keep-pattern, so it could never be removed anyway, and listing it would
  // imply a removal that never happens. The keep-list is intentionally blunter than it strictly needs
  // to be — leaving a few MB of Xbox captioning on disk is the correct price for a rule that cannot
  // accidentally take out NVDA's synth.
  "Microsoft.YourPhone",
  "Microsoft.ZuneMusic",
  "Microsoft.ZuneVideo",
  "MicrosoftCorporationII.MicrosoftFamily",
  "MicrosoftCorporationII.QuickAssist",
  "MicrosoftTeams",
  "MSTeams",
  "Microsoft.Windows.Copilot",
  "Microsoft.Copilot",
  "Microsoft.OutlookForWindows",
  "Microsoft.549981C3F5F10",
];

/**
 * Never remove anything matching these, whatever else says so.
 *
 * Matched case-insensitively as substrings, and checked *after* the removable list, so adding a package
 * to both lists keeps it. Speech and TextToSpeech are here because nano11 removes them and NVDA's synth
 * is `oneCore` — that single line is the difference between a trimmed guest and a silent one. The UIA
 * and accessibility entries are here because a screen reader reads the accessibility tree; removing that
 * would produce empty transcripts that look exactly like the mute faults we have already chased.
 */
export const KEEP_PATTERNS = [
  "edge", "webview", "speech", "texttospeech", "onecore", "narrator",
  "accessib", "uiautomation", "dotnet", "netfx", "vclibs", "ui.xaml", "runtime",
];

/**
 * Services safe to disable on a capture appliance, with the reason each is here.
 *
 * Audio services are deliberately absent. Speech is captured as text over NVDA Remote rather than as
 * audio, so it is tempting to disable them — but NVDA's synth initialises against the audio stack, and
 * a synth that fails to start is indistinguishable from the mute fault. Not worth the risk for ~20 MB.
 */
export const DISABLEABLE_SERVICES = [
  { name: "WSearch", why: "Windows Search indexing — SearchHost was 185 MB and indexes nothing we use" },
  { name: "CrossDeviceService", why: "Phone Link / cross-device — 74 MB, no phone is ever paired" },
  { name: "DiagTrack", why: "connected user experiences and telemetry" },
  { name: "MapsBroker", why: "downloaded maps" },
  { name: "XblAuthManager", why: "Xbox live auth" },
  { name: "XblGameSave", why: "Xbox live save" },
  { name: "XboxNetApiSvc", why: "Xbox networking" },
  { name: "wuauserv", why: "Windows Update — the appliance must not reboot or install mid-run" },
  { name: "UsoSvc", why: "Update Orchestrator, which restarts wuauserv" },
  { name: "WaaSMedicSVC", why: "Update Medic, which repairs the two above back to enabled" },
  { name: "dmwappushservice", why: "WAP push device management" },
];

/**
 * Defender is worth ~254 MB and is the largest single removable item, but it usually cannot be removed
 * from a *running* guest: Tamper Protection blocks `Set-MpPreference` and refuses writes to the
 * WinDefend service key. That is exactly why tiny11's "core" variant does it offline against a mounted
 * image, where Tamper Protection does not apply.
 *
 * We attempt it anyway and record the outcome rather than assuming either way, because the answer
 * decides whether an offline image pipeline is worth building at all: if this is the only thing that
 * needs an ISO, ~254 MB is the entire prize for that work, and it should be judged on that.
 */
export const DEFENDER_SERVICES = ["WinDefend", "WdNisSvc", "Sense"];

const matchesKeep = (name) => KEEP_PATTERNS.some((k) => name.toLowerCase().includes(k));

/**
 * Which of the installed packages should actually be removed.
 *
 * Deliberately takes the installed list rather than assuming it: package names carry version and
 * architecture suffixes that differ between ARM64 and x64 images, which is precisely the hardcoding that
 * makes nano11builder x64-only.
 *
 * @param {string[]} installed full package names as reported by the guest
 * @returns {string[]} the subset safe to remove
 */
export function packagesToRemove(installed) {
  return installed.filter((full) => {
    if (matchesKeep(full)) return false;
    return REMOVABLE_APPX.some((prefix) => full.toLowerCase().startsWith(prefix.toLowerCase()));
  });
}

/**
 * A one-line summary of what a trim did, for the worker to report over HTTP.
 *
 * Reported rather than logged because the guest's own log is not reachable while it is down, and
 * because "did the trim actually run" has to be answerable through the channel that is always up.
 *
 * @param {{ removed?: string[], disabled?: string[], failed?: string[], skipped?: boolean }} result
 */
export function trimSummary({ removed = [], disabled = [], failed = [], skipped = false }) {
  if (skipped) return "already trimmed";
  const parts = [`${removed.length} app(s) removed`, `${disabled.length} service(s) disabled`];
  if (failed.length) parts.push(`${failed.length} failed (${failed.slice(0, 3).join(", ")})`);
  return parts.join(", ");
}

// --- execution ---------------------------------------------------------------
//
// Everything below touches the guest OS. It runs once, at worker boot, guarded by a marker file, and
// only on win32. It is deliberately best-effort per item: one package that refuses to uninstall must
// not stop the rest, and none of it is a precondition for serving captures.


const POWERSHELL_TIMEOUT_MS = 120_000;

function powershell(command) {
  return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", timeout: POWERSHELL_TIMEOUT_MS });
}

/** Provisioned Appx package names currently on the image. */
function installedProvisionedPackages() {
  const out = powershell(
    "Get-AppxProvisionedPackage -Online | ForEach-Object { $_.PackageName }");
  return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/**
 * Remove background apps and disable services that no capture can reach.
 *
 * @param {{ markerPath: string, log?: (line: string) => void }} options
 * @returns {{ removed: string[], disabled: string[], failed: string[], skipped: boolean }}
 */
export function applyWindowsTrim({ markerPath, log = () => {} }) {
  const result = { removed: [], disabled: [], failed: [], skipped: false };
  if (process.platform !== "win32" || existsSync(markerPath)) {
    result.skipped = true;
    return result;
  }
  for (const pkg of packagesToRemove(installedProvisionedPackages())) {
    try {
      powershell(`Remove-AppxProvisionedPackage -Online -PackageName '${pkg}' -ErrorAction Stop`);
      result.removed.push(pkg);
    } catch (error) {
      // Some provisioned packages are in use or system-locked. Recorded, never fatal.
      result.failed.push(pkg.split("_")[0]);
      log(`trim: could not remove ${pkg}: ${error.message.split("\n")[0]}`);
    }
  }
  for (const { name } of DISABLEABLE_SERVICES) {
    try {
      powershell(`sc.exe config ${name} start= disabled; sc.exe stop ${name}`);
      result.disabled.push(name);
    } catch (error) {
      result.failed.push(name);
      log(`trim: could not disable ${name}: ${error.message.split("\n")[0]}`);
    }
  }
  writeFileSync(markerPath, `${new Date().toISOString()} ${trimSummary(result)}\n`, "utf8");
  log(`trim: ${trimSummary(result)}`);
  return result;
}

/**
 * Try to disable Defender, and report honestly whether Tamper Protection allowed it.
 *
 * Separate from `applyWindowsTrim` because it is the one item expected to fail, and the answer is a
 * decision input rather than housekeeping: if it fails, ~254 MB is the whole return on building an
 * offline image pipeline, and that is a much weaker case than "Windows overhead is 1.4 GB".
 *
 * @returns {{ disabled: boolean, reason: string }}
 */
export function tryDisableDefender() {
  if (process.platform !== "win32") return { disabled: false, reason: "not windows" };
  try {
    powershell("Set-MpPreference -DisableRealtimeMonitoring $true -ErrorAction Stop");
  } catch (error) {
    return { disabled: false, reason: `Tamper Protection refused: ${error.message.split("\n")[0]}` };
  }
  try {
    const state = powershell("(Get-MpComputerStatus).RealTimeProtectionEnabled").trim();
    return state.toLowerCase() === "false"
      ? { disabled: true, reason: "real-time protection off" }
      : { disabled: false, reason: `accepted the setting but still reports enabled (${state})` };
  } catch (error) {
    return { disabled: false, reason: `could not confirm: ${error.message.split("\n")[0]}` };
  }
}
