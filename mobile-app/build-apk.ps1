# Genera un APK de FashionStore con EAS Build y lo descarga a .\builds\
#
# Uso (desde PowerShell, dentro de la carpeta mobile-app):
#   .\build-apk.ps1                # perfil "development" (con dev-client, hot reload)
#   .\build-apk.ps1 -Profile preview   # APK independiente, sin necesitar Metro corriendo
#
# Si Windows bloquea la ejecucion de scripts, corre antes (una sola vez):
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

param(
    [string]$Profile = "development"
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "==> Perfil de build: $Profile"

# --- 1. eas-cli ---------------------------------------------------------------
if (-not (Get-Command eas -ErrorAction SilentlyContinue)) {
    Write-Host "==> eas-cli no esta instalado, instalando globalmente..."
    npm install -g eas-cli
}

# --- 2. sesion ------------------------------------------------------------------
eas whoami 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "==> No has iniciado sesion en Expo/EAS."
    Write-Host "    Si no tienes cuenta, creala gratis en https://expo.dev/signup"
    eas login
}

# --- 3. dependencias del proyecto ------------------------------------------------
if (-not (Test-Path "node_modules")) {
    Write-Host "==> Instalando dependencias del proyecto (npm install)..."
    npm install
}

# --- 4. lanzar el build y esperar -------------------------------------------------
Write-Host "==> Lanzando build en los servidores de EAS (tarda varios minutos)..."
$infoFile = Join-Path $env:TEMP "fashionstore-build-info.json"
eas build --platform android --profile $Profile --non-interactive --wait --json | Out-File -FilePath $infoFile -Encoding utf8

# --- 5. sacar la URL del APK del resultado -----------------------------------------
$json = Get-Content $infoFile -Raw | ConvertFrom-Json
$build = if ($json -is [System.Array]) { $json[0] } else { $json }

if ($build.status -ne "FINISHED" -or -not $build.artifacts.buildUrl) {
    Write-Host "El build no termino bien. Estado: $($build.status)" -ForegroundColor Red
    if ($build.error) { Write-Host ($build.error | ConvertTo-Json) -ForegroundColor Red }
    exit 1
}

$buildUrl = $build.artifacts.buildUrl

# --- 6. descargar --------------------------------------------------------------------
if (-not (Test-Path "builds")) { New-Item -ItemType Directory -Path "builds" | Out-Null }
$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$out = "builds\fashionstore-$Profile-$timestamp.apk"

Write-Host "==> Descargando APK a $out ..."
Invoke-WebRequest -Uri $buildUrl -OutFile $out

Remove-Item $infoFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Listo: $((Resolve-Path $out).Path)" -ForegroundColor Green
Write-Host ""
Write-Host "Como pasarlo a tu celular:"
Write-Host "  - Con el cable y adb:  adb install `"$out`""
Write-Host "  - Sin cable: sube el .apk a Drive/Telegram/WhatsApp, abrelo desde el"
Write-Host "    celular y dale instalar (activa `"origenes desconocidos`" si te lo pide)."
