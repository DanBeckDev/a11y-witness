@echo off
cd /d C:\Users\borem\a11y-witness
"C:\Program Files\nodejs\node.exe" src\capture\nvda\server.mjs > server.log 2>&1
