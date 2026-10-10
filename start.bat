@echo off
cd /d "%~dp0"
echo Starting GST Review Checklist app...
start "" http://localhost:4173
node server\index.js
pause
