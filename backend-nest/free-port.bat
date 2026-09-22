@echo off
REM Libera el puerto que usa el backend (por defecto 3000) matando el proceso
REM que lo tenga ocupado. Util cuando ves "EADDRINUSE" al arrancar.
REM
REM Uso:
REM   free-port.bat          -> libera el puerto 3000
REM   free-port.bat 5173     -> libera el puerto 5173 (frontend), etc.
setlocal
set "PORT=%~1"
if "%PORT%"=="" set "PORT=3000"

echo Buscando proceso usando el puerto %PORT% ...
set "PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr :%PORT% ') do set "PID=%%P"

if "%PID%"=="" (
    echo No hay ningun proceso escuchando en el puerto %PORT%. Ya esta libre.
) else (
    echo Matando proceso PID %PID% que ocupaba el puerto %PORT% ...
    taskkill /PID %PID% /F
)
endlocal
