@echo off
rem First-time setup: install packages, build the screen, create the .env file.
cd /d "%~dp0..\..\.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
if not exist "apps\lp-dashboard\.env" (
  copy "apps\lp-dashboard\.env.example" "apps\lp-dashboard\.env" >nul
  echo Put your Alchemy API key into the .env file that opens now, then save it.
  notepad "apps\lp-dashboard\.env"
)
echo.
echo Setup complete. Double-click start-dashboard.bat to run the dashboard.
pause
exit /b 0
:fail
echo.
echo Setup failed. Check the messages above.
pause
exit /b 1
