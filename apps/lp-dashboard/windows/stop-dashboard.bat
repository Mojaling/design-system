@echo off
rem Stops the dashboard (same as the "stop server" button).
powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4747/api/shutdown' -ContentType 'application/json' -Body '{}' | Out-Null; Write-Host 'Dashboard stopped.' } catch { Write-Host 'Dashboard is not running.' }"
timeout /t 3 >nul
