@echo off
cd /d C:\Users\borem\a11y-witness
"C:\Program Files\nodejs\node.exe" nvda-capture.mjs "%~1" "C:\Users\borem\a11y-witness\transcript.json" 150 > capture.log 2>&1
echo EXITCODE %ERRORLEVEL%>> capture.log
taskkill /im msedge.exe /f >> capture.log 2>&1
