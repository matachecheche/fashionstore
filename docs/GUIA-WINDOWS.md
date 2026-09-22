# Guía para Windows

1. Instala **Node.js LTS** (https://nodejs.org), **Python 3.9+** (https://python.org — marca «Add to PATH») y **PostgreSQL 16** (https://www.postgresql.org/download/windows/).
   Recuerda la contraseña del usuario `postgres` que elegiste en la instalación.
2. Descomprime el zip (ruta sin espacios raros, por ejemplo `C:\fashionstore`).
3. Doble clic en **`iniciar-windows.bat`**. La primera vez tarda unos minutos (instala paquetes). Si tu contraseña de PostgreSQL no es `postgres`, el script te la pedirá
   (o ejecuta `iniciar-windows.bat --pg-password TU_CLAVE`).
4. Abre http://localhost:5173. Para la app móvil, escanea el QR con **Expo Go** (misma WiFi). Si Windows Firewall pregunta, permite **Node.js** en redes privadas.
5. Para apagar todo: `detener-windows.bat`.

**Acentos**: el script crea la base en UTF-8 y carga el SQL con `PGCLIENTENCODING=UTF8`. Si antes tenías datos con acentos rotos, ejecuta `iniciar-windows.bat --reset-db`.
Abre los `.md` y `.csv` con VS Code o Excel (los CSV llevan BOM UTF-8).
