@echo off
rem Start the dashboard automatically when Windows starts.
set "TARGET=%~dp0run-hidden.vbs"
powershell -NoProfile -Command "$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup') + '\LP Dashboard.lnk'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET%\"'; $s.WorkingDirectory = '%~dp0'; $s.Save()"
echo Autostart installed. The dashboard will start when you log in to Windows.
pause
