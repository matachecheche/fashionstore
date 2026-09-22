@echo off
rem FashionStore - lanzador para Windows. Solo llama a iniciar.py (toda la logica esta en Python).
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 ( py -3 iniciar.py %* ) else ( python iniciar.py %* )
echo.
pause
