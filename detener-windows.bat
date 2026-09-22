@echo off
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 ( py -3 iniciar.py --detener ) else ( python iniciar.py --detener )
pause
