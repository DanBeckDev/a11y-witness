@echo off
rem Launch the NVDA capture worker. Invoked by the a11ysrv scheduled task, which MUST
rem use LogonType Interactive so this runs inside the logged-on desktop session (NVDA
rem is a GUI app and announces nothing without one).
rem
rem Paths derive from this script's own location (%~dp0 = ...\src\capture\nvda\) rather
rem than being hardcoded. A hardcoded C:\Users\<name>\a11y-witness breaks the moment the
rem worker is set up under a different account -- which is exactly what happens when a
rem prebuilt VM image is reused. See docs/local-worker-vm.md.
setlocal
cd /d "%~dp0..\..\.." || exit /b 1

set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

"%NODE_EXE%" src\capture\nvda\server.mjs > server.log 2>&1
