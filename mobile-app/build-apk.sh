#!/usr/bin/env bash
# Genera un APK de FashionStore con EAS Build y lo descarga a ./builds/
#
# Uso:
#   ./build-apk.sh              -> perfil "development" (con dev-client, hot reload)
#   ./build-apk.sh preview      -> perfil "preview" (APK independiente, sin necesitar
#                                   Metro corriendo; sirve para instalar y usar directo)
#
set -euo pipefail
cd "$(dirname "$0")"

PROFILE="${1:-development}"

echo "==> Perfil de build: $PROFILE"

# --- 1. eas-cli -------------------------------------------------------------
if ! command -v eas >/dev/null 2>&1; then
  echo "==> eas-cli no está instalado, instalando globalmente..."
  npm install -g eas-cli
fi

# --- 2. sesión ---------------------------------------------------------------
if ! eas whoami >/dev/null 2>&1; then
  echo "==> No has iniciado sesión en Expo/EAS."
  echo "    Si no tienes cuenta, créala gratis en https://expo.dev/signup"
  eas login
fi

# --- 3. dependencias del proyecto --------------------------------------------
if [ ! -d node_modules ]; then
  echo "==> Instalando dependencias del proyecto (npm install)..."
  npm install
fi

# --- 4. lanzar el build y esperar --------------------------------------------
echo "==> Lanzando build en los servidores de EAS (tarda varios minutos)..."
INFO_FILE="$(mktemp)"
eas build --platform android --profile "$PROFILE" --non-interactive --wait --json > "$INFO_FILE"

# --- 5. sacar la URL del APK del resultado -----------------------------------
BUILD_URL="$(node -e '
  const fs = require("fs");
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const build = Array.isArray(data) ? data[0] : data;
  if (!build || build.status !== "FINISHED" || !build.artifacts || !build.artifacts.buildUrl) {
    console.error("El build no terminó bien. Estado: " + (build && build.status));
    if (build && build.error) console.error(JSON.stringify(build.error));
    process.exit(1);
  }
  console.log(build.artifacts.buildUrl);
' "$INFO_FILE")"

# --- 6. descargar --------------------------------------------------------------
mkdir -p builds
OUT="builds/fashionstore-${PROFILE}-$(date +%Y%m%d-%H%M).apk"
echo "==> Descargando APK a $OUT ..."
curl -fL -o "$OUT" "$BUILD_URL"

rm -f "$INFO_FILE"

echo ""
echo "✅ Listo: $(pwd)/$OUT"
echo ""
echo "Cómo pasarlo a tu celular:"
echo "  - Con el cable y adb:  adb install \"$OUT\""
echo "  - Sin cable: sube el .apk a Drive/Telegram/WhatsApp, ábrelo desde el"
echo "    celular y dale instalar (activa \"orígenes desconocidos\" si te lo pide)."
