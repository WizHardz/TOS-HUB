@echo off
rem Runs create-shortcut.ps1 (in this same folder) to put a TOS HUB icon on your desktop.
rem Open create-shortcut.ps1 in Notepad if you want to see exactly what it does.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1"
echo.
pause
