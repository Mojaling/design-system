@echo off
rem Double-click: start the LP dashboard in the background (no console window)
rem and open it in the browser.
cd /d "%~dp0"
wscript.exe "%~dp0run-hidden.vbs"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:4747"
