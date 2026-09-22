# Dejar de depender de Expo Go

La app ya no necesita la app "Expo Go" del Play Store. En su lugar se instala
un APK propio del proyecto (un "development build") que trae compilados
expo-camera, expo-media-library, etc. exactamente en la versión que usa
package.json, así que no vuelve a pasar el error `Cannot find native module`.

## Opción A — con EAS (recomendada, no necesita Android Studio)

1. Instala el CLI una sola vez:
   ```
   npm install -g eas-cli
   ```
2. Inicia sesión (crea cuenta gratis en https://expo.dev si no tienes):
   ```
   eas login
   ```
3. Desde `mobile-app/`, genera el build de desarrollo:
   ```
   npm run build:dev
   ```
   (esto corre `eas build --profile development --platform android`, usa los
   servidores de Expo para compilar y tarda unos minutos)
4. Al terminar te da un link/QR para descargar el `.apk`. Instálalo en tu
   celular Android (activa "orígenes desconocidos" si te lo pide).
5. Con el APK instalado, arranca el servidor de desarrollo normal:
   ```
   npm run start
   ```
   Abre la app del APK (no Expo Go) — se conecta sola al mismo servidor
   Metro, con hot reload igual que antes.

## Opción B — build local con USB (sin depender de servidores de EAS)

Requiere tener Android Studio / Android SDK instalado (no funciona dentro de
un Codespace, ahí no hay emulador ni acceso USB). Con el celular conectado
por USB y depuración USB activada:

```
npm run android
```

Esto compila el proyecto nativo localmente e instala el resultado
directamente en el teléfono.

## Nota

Cada vez que agregues un paquete nuevo que tenga código nativo (otro
`expo-algo`), hay que repetir el build (`npm run build:dev` o `npm run
android`) — para JS puro (pantallas, lógica, estilos) no hace falta, ahí sigue
funcionando el hot reload normal con `npm run start`.
