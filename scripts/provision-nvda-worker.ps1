# Provision (or repair) the Windows NVDA capture worker. Idempotent: safe to
# re-run on an already-working machine, and that is the intended way to repair one.
#
# Encodes every step the worker needs, in dependency order, with a verification
# line after each. Written to be run by a person OR an agent. Copy it over and run
# it with -File:
#
#   scp scripts/provision-nvda-worker.ps1 user@host:C:/Users/user/
#   ssh user@host "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\user\provision-nvda-worker.ps1"
#
# Do NOT pipe this to `powershell -Command -`. That mode silently truncated a script
# of this size mid-run, and a leading `<# #>` block comment suppresses its output
# entirely. Reserve stdin piping for short ad-hoc snippets; use -File for anything real.
#
# Read docs/nvda-worker-runbook.md first if anything here is surprising. Each step
# exists because its absence has broken capture at least once.
#
# Config comes from the environment rather than param(), so the same file works in
# either invocation mode:
#   A11Y_REPO_PATH        checkout location (default %USERPROFILE%\a11y-witness)
#   A11Y_PORT             worker port; must match the client's A11Y_WORKER (default 8765)
#   A11Y_TASK_NAME        scheduled-task name (default a11ysrv)
#   A11Y_SKIP_NPM_INSTALL set to 1 to re-apply only OS/NVDA configuration

$ErrorActionPreference = 'Stop'

$RepoPath       = if ($env:A11Y_REPO_PATH) { $env:A11Y_REPO_PATH } else { Join-Path $env:USERPROFILE 'a11y-witness' }
$Port           = if ($env:A11Y_PORT) { [int] $env:A11Y_PORT } else { 8765 }
$TaskName       = if ($env:A11Y_TASK_NAME) { $env:A11Y_TASK_NAME } else { 'a11ysrv' }
$SkipNpmInstall = $env:A11Y_SKIP_NPM_INSTALL -eq '1'
$script:warnings = @()

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function OK($msg)       { Write-Host "    OK    $msg" -ForegroundColor Green }
function Warn($msg)     { Write-Host "    WARN  $msg" -ForegroundColor Yellow; $script:warnings += $msg }

# npm and npx write progress and warnings to stderr as a matter of course. With
# $ErrorActionPreference = 'Stop', PowerShell promotes ANY native stderr line to a
# terminating NativeCommandError — so npm's routine "allow-scripts" warning would
# abort provisioning with a misleading error. Relax error handling around native
# calls and gate on the only trustworthy signal: the process exit code.
function Invoke-Native($exe, [string[]] $cmdArgs, [string] $what, [int] $tail = 4) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out  = & $exe @cmdArgs 2>&1
    $code = $LASTEXITCODE
    $out | Select-Object -Last $tail | ForEach-Object { Write-Host "      $_" }
    if ($code -ne 0) { throw "$what failed (exit $code)." }
  } finally { $ErrorActionPreference = $prev }
}

# npx.ps1 is blocked by the default execution policy, so always call the .cmd.
$npx = Join-Path $env:ProgramFiles 'nodejs\npx.cmd'
$npm = Join-Path $env:ProgramFiles 'nodejs\npm.cmd'

# ---------------------------------------------------------------------------
Step 1 'Preconditions'

if (-not (Test-Path $RepoPath)) { throw "Repo not found at $RepoPath. Clone it first, or pass -RepoPath." }
OK "repo at $RepoPath"

foreach ($exe in @($npx, $npm)) {
  if (-not (Test-Path $exe)) { throw "Node.js not found ($exe). Install it: winget install --id OpenJS.NodeJS.LTS -e --silent" }
}
OK "node $(& node --version), npm $(& $npm --version)"

# NVDA is a GUI app: it needs a real logged-on desktop. Over SSH alone there is no
# interactive session and NVDA announces nothing at all, so this is worth asserting
# loudly rather than discovering later via empty transcripts.
# `query session` prefixes the CURRENT session with '>', so the anchor must allow it;
# otherwise this warns "NO active console session" on a box that plainly has one.
$console = (query session 2>$null | Select-String '^\s*>?\s*console\s+\S+\s+\d+\s+Active')
if ($console) { OK 'an interactive console session is logged on' }
else { Warn 'NO active console session. NVDA cannot run until someone is logged on at the console (see the auto-logon step).' }

$elevated = (New-Object Security.Principal.WindowsPrincipal(
  [Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole(
  [Security.Principal.WindowsBuiltinRole]::Administrator)
if ($elevated) { OK 'session is elevated (needed for the firewall/Edge-policy steps)' }
else { Warn 'not elevated: the firewall and Edge-policy steps will be skipped.' }

# ---------------------------------------------------------------------------
Step 2 'Dependencies'

if ($SkipNpmInstall) { OK 'skipped (A11Y_SKIP_NPM_INSTALL=1)' }
else {
  Push-Location $RepoPath
  try { Invoke-Native $npm @('install') 'npm install' }
  finally { Pop-Location }
}
$gpManifest = Join-Path $RepoPath 'node_modules\@guidepup\guidepup\package.json'
if (-not (Test-Path $gpManifest)) { throw '@guidepup/guidepup is not installed. Run npm install.' }
$gpVersion = (Get-Content $gpManifest -Raw | ConvertFrom-Json).version
OK "@guidepup/guidepup $gpVersion"

# guidepup <0.29 looks for the old NVDA Remote ADD-ON certificate; NVDA 2026.1.x
# ships Remote Access in core and has no such add-on, so the pair fails at
# NVDAClient.connect and reports it, misleadingly, as "NVDA not installed".
if ([version]($gpVersion -replace '-.*$') -lt [version]'0.29.0') {
  Warn "guidepup $gpVersion cannot drive NVDA 2026.x. Bump it to >=0.29.2 in package.json."
}

# ---------------------------------------------------------------------------
Step 3 'Guidepup environment (zeroes ForegroundLockTimeout so Edge can take focus)'

Push-Location $RepoPath
try { Invoke-Native $npx @('--yes', '@guidepup/setup', 'setup') 'guidepup setup' 2 }
finally { Pop-Location }
# Set this ourselves rather than trusting `guidepup setup` to have done it. On a fresh
# Windows 11 ARM64 install it was still at the default 200000, and the cost is brutal to
# diagnose: captures return 0 phrases with NO error anywhere -- nvda.start() succeeds,
# windowsActivate reports ok, and then every read comes back empty, because Edge is
# refused the foreground and NVDA has nothing to read. The README calls this the #1
# flakiness fix; it deserves to be asserted, not hoped for.
Set-ItemProperty 'HKCU:\Control Panel\Desktop' -Name ForegroundLockTimeout -Value 0 -Type DWord
$flt = (Get-ItemProperty 'HKCU:\Control Panel\Desktop' -Name ForegroundLockTimeout -ErrorAction SilentlyContinue).ForegroundLockTimeout
if ($flt -eq 0) {
  # The value is cached per session, so a session that is already running keeps the old
  # one until the next logon. With auto-logon plus the at-logon trigger, a reboot applies
  # it and brings the worker back on its own.
  OK 'ForegroundLockTimeout = 0 (takes effect at next logon)'
} else {
  Warn "ForegroundLockTimeout = $flt (could not set it; Edge may fail to take focus)"
}

# ---------------------------------------------------------------------------
Step 4 'Install NVDA'

# Run from the repo: the installer reads the LOCAL @guidepup/guidepup manifest.json
# to decide which NVDA build to fetch, so this is what keeps the screen reader and
# the driver in lockstep. It caches to %LOCALAPPDATA%\guidepup (override with
# GUIDEPUP_SCREEN_READERS_PATH) -- NOT %TEMP%, which Windows cleanup empties.
Push-Location $RepoPath
try { Invoke-Native $npx @('--yes', '@guidepup/setup', 'install', 'nvda') 'guidepup install nvda' 4 }
finally { Pop-Location }

$cacheRoot = if ($env:GUIDEPUP_SCREEN_READERS_PATH) { $env:GUIDEPUP_SCREEN_READERS_PATH } else { Join-Path $env:LOCALAPPDATA 'guidepup' }
$nvdaExe = Get-ChildItem (Join-Path $cacheRoot 'nvda') -Recurse -Filter 'nvda.exe' -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $nvdaExe) { throw "NVDA not found under $cacheRoot. The install step failed." }

# A gutted install is the failure this whole script exists to prevent: %TEMP%
# cleanup once deleted library.zip and left nvda.exe as a stub that launches and
# dies, producing "Timed out waiting for NVDA to be running" and no nvda.log.
$nvdaDir  = Split-Path $nvdaExe.FullName
$fileCount = (Get-ChildItem $nvdaDir -Recurse -File -ErrorAction SilentlyContinue).Count
if ($fileCount -lt 500) { throw "NVDA install at $nvdaDir looks gutted ($fileCount files; expect ~1700+). Delete it and re-run." }
OK "NVDA at $nvdaDir ($fileCount files)"
foreach ($required in @('library.zip', 'nvda_slave.exe')) {
  if (-not (Test-Path (Join-Path $nvdaDir $required))) { throw "NVDA install is incomplete: $required missing." }
}
OK 'payload files present (library.zip, nvda_slave.exe)'

# ---------------------------------------------------------------------------
Step 5 'Disable the NVDA Speech Viewer'

# Guidepup's bundled config ships the Speech Viewer ON. That window's focus event
# is announced, so it lands in the spokenPhraseLog delta captured right after
# activating a control: every interaction probe returns "NVDA Speech Viewer"
# instead of the page's response, making an accessible page and an inaccessible
# one indistinguishable. capture-check still passes, because it asserts that the
# probe fired, not what it heard -- so this fails silently and must be asserted.
$patched = 0
foreach ($ini in (Get-ChildItem $nvdaDir -Recurse -Filter 'nvda.ini' -ErrorAction SilentlyContinue)) {
  $body = Get-Content $ini.FullName -Raw
  $new  = $body -replace 'showSpeechViewerAtStartup = True', 'showSpeechViewerAtStartup = False'
  if ($new -ne $body) { Set-Content -Path $ini.FullName -Value $new -NoNewline; $patched++ }
}
$stillOn = (Get-ChildItem $nvdaDir -Recurse -Filter 'nvda.ini' -ErrorAction SilentlyContinue |
  Select-String 'showSpeechViewerAtStartup = True')
if ($stillOn) { throw 'Speech Viewer is still enabled; interaction probes would be unusable.' }
OK "Speech Viewer off (patched $patched file(s)). NOTE: reinstalling NVDA resets this -- re-run this script."

# ---------------------------------------------------------------------------
Step 6 'No blocking dialogs (a VM console cannot be clicked)'

if ($elevated) {
  # A program that starts listening with no matching rule raises the "allow this
  # app" alert, which blocks the whole interactive session until dismissed.
  Set-NetFirewallProfile -Profile Domain, Private, Public -NotifyOnListen False
  OK 'firewall NotifyOnListen = False (no allow-app dialogs)'

  $ruleName = "a11y-witness worker $Port"
  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
      -Protocol TCP -LocalPort $Port -Profile Any | Out-Null
  }
  OK "inbound rule '$ruleName'"

  # A brand-new Edge profile shows a welcome/sign-in surface. On a page with no
  # headings, NVDA quick-nav escapes the empty document into that browser UI and
  # records it as phantom elements ("Welcome to Microsoft Edge").
  $edgeKey = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
  New-Item -Path $edgeKey -Force | Out-Null
  Set-ItemProperty $edgeKey -Name 'HideFirstRunExperience' -Value 1 -Type DWord
  Set-ItemProperty $edgeKey -Name 'BrowserSignin' -Value 0 -Type DWord
  OK 'Edge first-run policies set'
} else {
  Warn 'skipped firewall + Edge policies (needs elevation)'
}

# UAC prompts land on the secure desktop, where NVDA cannot read them and
# automation cannot click them. The answer is to need no elevation at runtime --
# never to elevate the worker. Guidepup drives nvda_noUIAccess.exe, which cannot
# read elevated windows at all, so an elevated browser would capture nothing.
if ((Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -ErrorAction SilentlyContinue).PromptOnSecureDesktop -eq 1) {
  OK 'UAC prompts on secure desktop (fine: nothing in the capture path needs elevation)'
}

# The screensaver can take the foreground mid-capture and steal focus from Edge.
Set-ItemProperty 'HKCU:\Control Panel\Desktop' -Name ScreenSaveActive -Value '0'
Set-ItemProperty 'HKCU:\Control Panel\Desktop' -Name ScreenSaveTimeOut -Value '0'
OK 'screensaver disabled'

# ---------------------------------------------------------------------------
Step 7 'Durable Edge capture profile'

# capture-core.mjs defaults this under %LOCALAPPDATA%; A11Y_EDGE_PROFILE overrides.
# It must not sit in %TEMP%, for the same reason the NVDA install must not.
$edgeProfile = if ($env:A11Y_EDGE_PROFILE) { $env:A11Y_EDGE_PROFILE } else { Join-Path $env:LOCALAPPDATA 'a11y-witness\edge-profile' }
New-Item -ItemType Directory -Force -Path $edgeProfile | Out-Null
OK "Edge profile dir $edgeProfile"

# ---------------------------------------------------------------------------
Step 8 "Worker scheduled task '$TaskName'"

# LogonType Interactive is mandatory: the task then runs inside the logged-on
# desktop session. A service, or a plain SSH command, has no desktop and NVDA
# announces nothing. RunLevel Limited (not Highest) keeps it unelevated on
# purpose -- see the UAC/UIAccess note above.
$cmd = Join-Path $RepoPath 'src\capture\nvda\run-server.cmd'
if (-not (Test-Path $cmd)) { throw "Worker launcher not found: $cmd" }

# Use the RESOLVED identity, not "$env:USERDOMAIN\$env:USERNAME": on a workgroup
# machine USERDOMAIN is literally "WORKGROUP", which is not an account any SID maps
# to, and Register-ScheduledTask fails with HRESULT 0x80070534.
$account   = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action    = New-ScheduledTaskAction -Execute $cmd
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
# An at-logon trigger is what makes the worker self-healing across reboots. Without
# it the task sits at "Ready" forever and the machine looks dead after a restart.
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $account
Register-ScheduledTask -TaskName $TaskName -Action $action -Principal $principal -Trigger $trigger -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
OK "registered: logon=$($task.Principal.LogonType) runLevel=$($task.Principal.RunLevel) triggers=$(($task.Triggers | Measure-Object).Count)"

# ---------------------------------------------------------------------------
Step 9 'Start and verify'

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $TaskName
$listening = $false
foreach ($i in 1..20) {
  Start-Sleep -Seconds 1
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { $listening = $true; break }
}
if (-not $listening) { throw "Worker did not listen on $Port. Check $RepoPath\server.log." }
OK "listening on $Port"

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 10
  OK "/health -> ok=$($health.ok) screenReader=$($health.screenReader)"
} catch { throw "/health failed: $($_.Exception.Message)" }

# ---------------------------------------------------------------------------
Write-Host "`n--- Provisioning complete ---" -ForegroundColor Cyan
if ($script:warnings.Count) {
  Write-Host "$($script:warnings.Count) warning(s):" -ForegroundColor Yellow
  $script:warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

Write-Host @"

Next steps this script deliberately does NOT do:

  1. Auto-logon. NVDA needs a logged-on console session, so after a reboot the
     worker cannot run until someone logs in. Enabling it requires a password,
     which must not be baked into a checked-in script. Prefer Sysinternals
     Autologon (stores the secret encrypted in LSA, not plaintext in the registry):
         .\Autologon.exe -accepteula $env:USERNAME $env:COMPUTERNAME <password>
     Run it on the console, or in your own shell, so the password is not recorded.

  2. Prove capture end-to-end. From the control machine:
         curl http://<this-host>:$Port/health
         node src/capture/nvda/capture-check.mjs     # on THIS box, in the console session

  3. Diagnose a broken worker: scripts/diagnose-nvda-worker.ps1
"@
