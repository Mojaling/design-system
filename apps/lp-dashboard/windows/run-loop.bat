@echo off
rem Keeps the dashboard running.
rem Exit code 0 (the "stop server" button or stop-dashboard.bat) ends the loop.
rem Any other exit code (a crash) restarts it after 5 seconds.
setlocal
cd /d "%~dp0.."
if not exist "data" mkdir "data"
if not exist "web\dist\index.html" (
  call npm run build > "data\build.log" 2>&1
)
:loop
node server\index.js > nul 2>> "data\crash.log"
if "%ERRORLEVEL%"=="0" goto end
timeout /t 5 /nobreak >nul
goto loop
:end
endlocal
