@echo off
rem Stop starting the dashboard automatically.
powershell -NoProfile -Command "Remove-Item -ErrorAction SilentlyContinue ([Environment]::GetFolderPath('Startup') + '\LP Dashboard.lnk')"
echo Autostart removed.
pause
