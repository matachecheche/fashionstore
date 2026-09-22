@echo off
REM Genera un APK de FashionStore con EAS Build y lo descarga a builds\
REM
REM Uso (doble clic, o desde CMD dentro de la carpeta mobile-app):
REM   build-apk.bat              -> perfil "development" (con dev-client, hot reload)
REM   build-apk.bat preview      -> APK independiente, sin necesitar Metro corriendo
REM
setlocal
cd /d "%~dp0"

set "PROFILE=%~1"
if "%PROFILE%"=="" set "PROFILE=development"

echo ==^> Perfil de build: %PROFILE%

REM --- 1. eas-cli ---------------------------------------------------------------
where eas >nul 2>nul
if errorlevel 1 (
    echo ==^> eas-cli no esta instalado, instalando globalmente...
    call npm install -g eas-cli
    if errorlevel 1 goto :error
)

REM --- 2. sesion ------------------------------------------------------------------
call eas whoami >nul 2>nul
if errorlevel 1 (
    echo ==^> No has iniciado sesion en Expo/EAS.
    echo     Si no tienes cuenta, creala gratis en https://expo.dev/signup
    call eas login
    if errorlevel 1 goto :error
)

REM --- 3. dependencias del proyecto ------------------------------------------------
if not exist node_modules (
    echo ==^> Instalando dependencias del proyecto npm install...
    call npm install
    if errorlevel 1 goto :error
)

REM --- 4. lanzar el build y esperar -------------------------------------------------
echo ==^> Lanzando build en los servidores de EAS, esto tarda varios minutos...
set "INFOFILE=%TEMP%\fashionstore-build-info.json"
call eas build --platform android --profile %PROFILE% --non-interactive --wait --json > "%INFOFILE%"
if errorlevel 1 goto :error

REM --- 5. sacar la URL del APK del resultado -----------------------------------------
set "BUILDURL="
for /f "usebackq delims=" %%U in (`node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const b=Array.isArray(d)?d[0]:d;if(!b||b.status!=='FINISHED'||!b.artifacts||!b.artifacts.buildUrl){console.error('El build no termino bien. Estado: '+(b&&b.status));process.exit(1);}console.log(b.artifacts.buildUrl);" "%INFOFILE%"`) do set "BUILDURL=%%U"

if "%BUILDURL%"=="" (
    echo No se pudo obtener la URL del APK. Revisa %INFOFILE%
    goto :error
)

REM --- 6. descargar --------------------------------------------------------------------
if not exist builds mkdir builds

for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"`) do set "TIMESTAMP=%%T"
set "OUT=builds\fashionstore-%PROFILE%-%TIMESTAMP%.apk"

echo ==^> Descargando APK a %OUT% ...
curl -fL -o "%OUT%" "%BUILDURL%"
if errorlevel 1 goto :error

del "%INFOFILE%" >nul 2>nul

echo.
echo Listo: %CD%\%OUT%
echo.
echo Como pasarlo a tu celular:
echo   - Con el cable y adb:  adb install "%OUT%"
echo   - Sin cable: sube el .apk a Drive/Telegram/WhatsApp, abrelo desde el
echo     celular y dale instalar (activa "origenes desconocidos" si te lo pide).
goto :eof

:error
echo.
echo Algo fallo. Revisa el mensaje de arriba.
exit /b 1
