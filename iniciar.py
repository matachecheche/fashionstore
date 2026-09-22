#!/usr/bin/env python3
"""
FashionStore - Lanzador todo-en-uno (Windows / Linux / macOS / GitHub Codespaces).

    python iniciar.py                 # prepara todo (la 1a vez) y levanta API, IA, PostgREST, web y Expo
    python iniciar.py --sin-movil     # todo menos Expo (util para probar solo la web)
    python iniciar.py --detener       # detiene los servicios que dejó en segundo plano
    python iniciar.py --estado        # muestra qué está corriendo
    python iniciar.py --reset-db      # BORRA y recrea la base de datos con los datos de demostración
    python iniciar.py --solo-preparar # solo instala y configura, sin arrancar nada

Es IDEMPOTENTE: puedes ejecutarlo cuantas veces quieras; solo hace lo que falta.
Solo usa la biblioteca estándar de Python (3.8+).

Sobre los acentos y la ñ: la base se crea con codificación UTF8 y todo el trabajo con psql se hace con
PGCLIENTENCODING=UTF8, así el texto nunca se interpreta como WIN1252 (causa típica de "Ã©" en Windows).
"""
import argparse
import getpass
import hashlib
import json
import os
import platform
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

# La consola de Windows puede no ser UTF-8: se fuerza para poder imprimir acentos sin errores
for _flujo in (sys.stdout, sys.stderr):
    try:
        _flujo.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

RAIZ = Path(__file__).resolve().parent
RUNTIME = RAIZ / ".runtime"
LOGS = RAIZ / "logs"
CONFIG = RAIZ / ".fashionstore.json"
ES_WINDOWS = platform.system() == "Windows"
ES_CODESPACES = os.environ.get("CODESPACES") == "true" and bool(os.environ.get("CODESPACE_NAME"))
ESQUEMA_VERSION = "2"

PUERTOS = {"api": 3000, "ia": 8000, "postgrest": 3001, "web": 5173}


# ------------------------------------------------------------------------------------------------ utilidades de consola
def titulo(t):
    print(f"\n\033[1m== {t}\033[0m" if sys.stdout.isatty() and not ES_WINDOWS else f"\n== {t}")


def ok(t):
    print(f"  [OK] {t}")


def info(t):
    print(f"       {t}")


def aviso(t):
    print(f"  [!]  {t}")


def error(t):
    print(f"  [X]  {t}")


def salir(t, codigo=1):
    error(t)
    sys.exit(codigo)


# ------------------------------------------------------------------------------------------------ configuración persistente
def cargar_config():
    try:
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    except Exception:
        return {}


def guardar_config(c):
    CONFIG.write_text(json.dumps(c, indent=2, ensure_ascii=False), encoding="utf-8")


# ------------------------------------------------------------------------------------------------ localización de herramientas
def buscar_psql():
    r = shutil.which("psql")
    if r:
        return r
    if ES_WINDOWS:
        for base in (os.environ.get("ProgramFiles", r"C:\Program Files"), os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")):
            for p in sorted(Path(base).glob("PostgreSQL/*/bin/psql.exe"), reverse=True):
                return str(p)
    else:
        for p in ("/usr/lib/postgresql/*/bin/psql", "/opt/homebrew/opt/postgresql*/bin/psql", "/usr/local/opt/postgresql*/bin/psql", "/Applications/Postgres.app/Contents/Versions/*/bin/psql"):
            for q in sorted(Path("/").glob(p.lstrip("/")), reverse=True):
                return str(q)
    return None


def version_node(node):
    try:
        v = subprocess.run([node, "-v"], capture_output=True, text=True).stdout.strip().lstrip("v")
        return int(v.split(".")[0])
    except Exception:
        return 0


def comprobar_requisitos():
    titulo("1. Requisitos")
    faltan = []
    node = shutil.which("node")
    npm = shutil.which("npm")
    if not node or version_node(node) < 18:
        faltan.append("Node.js 18 o superior (https://nodejs.org, versión LTS)")
    else:
        ok(f"Node.js {version_node(node)}")
    if not npm:
        faltan.append("npm (viene con Node.js)")
    else:
        ok("npm")
    if sys.version_info < (3, 9):
        faltan.append("Python 3.9 o superior")
    else:
        ok(f"Python {platform.python_version()}")
    psql = buscar_psql()
    if not psql:
        faltan.append("PostgreSQL 13+ con la herramienta psql (Windows: https://www.postgresql.org/download/windows/ - Codespaces/Ubuntu: sudo apt install postgresql postgresql-contrib)")
    else:
        ok(f"psql: {psql}")
    if faltan:
        print()
        error("Faltan estos requisitos:")
        for f in faltan:
            info("- " + f)
        sys.exit(1)
    return {"node": node, "npm": npm, "psql": psql}


# ------------------------------------------------------------------------------------------------ PostgreSQL
class PG:
    def __init__(self, psql, cfg):
        self.psql = psql
        self.host, self.port, self.user, self.password, self.db = cfg["pg_host"], str(cfg["pg_port"]), cfg["pg_user"], cfg["pg_password"], cfg["pg_db"]

    def env(self):
        e = os.environ.copy()
        e.update(PGPASSWORD=self.password, PGCLIENTENCODING="UTF8", PGOPTIONS="-c client_min_messages=warning", LC_MESSAGES="C")
        return e

    def run(self, sql=None, archivo=None, db=None, stop=True):
        cmd = [self.psql, "-h", self.host, "-p", self.port, "-U", self.user, "-d", db or self.db, "-X", "-q", "-t", "-A"]
        if stop:
            cmd += ["-v", "ON_ERROR_STOP=1"]
        cmd += ["-c", sql] if sql else ["-f", str(archivo)]
        r = subprocess.run(cmd, env=self.env(), capture_output=True, text=True, encoding="utf-8", errors="replace")
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()

    def conecta(self):
        return self.run("SELECT 1", db="postgres")[0] == 0

    def url(self, host=None):
        from urllib.parse import quote
        return f"postgresql://{quote(self.user, safe='')}:{quote(self.password, safe='')}@{host or self.host}:{self.port}/{self.db}"


def configurar_postgres(args, psql, cfg):
    titulo("2. Base de datos PostgreSQL")
    cfg.setdefault("pg_host", "localhost")
    cfg.setdefault("pg_port", 5432)
    cfg.setdefault("pg_user", "postgres")
    cfg.setdefault("pg_db", "fashionstore")
    for k, a in (("pg_host", args.pg_host), ("pg_port", args.pg_port), ("pg_user", args.pg_user), ("pg_db", args.db_name)):
        if a:
            cfg[k] = a
    candidatos = [c for c in (args.pg_password, os.environ.get("PGPASSWORD"), cfg.get("pg_password"), "postgres", "admin", "1234", "") if c is not None]
    pg = None
    for pw in dict.fromkeys(candidatos):
        cfg["pg_password"] = pw
        p = PG(psql, cfg)
        if p.conecta():
            pg = p
            break
    while pg is None:
        info(f"No pude conectar a PostgreSQL en {cfg['pg_host']}:{cfg['pg_port']} con el usuario '{cfg['pg_user']}'.")
        info("¿Está encendido el servicio? (Windows: Servicios -> postgresql-x64-XX; Linux: sudo service postgresql start)")
        if not sys.stdin.isatty():
            salir("Ejecuta de nuevo con --pg-password TU_CLAVE (y --pg-user/--pg-host/--pg-port si difieren).")
        cfg["pg_password"] = getpass.getpass(f"  Contraseña de PostgreSQL para '{cfg['pg_user']}' (Enter para cancelar): ")
        if not cfg["pg_password"]:
            salir("Cancelado.")
        p = PG(psql, cfg)
        if p.conecta():
            pg = p
    ok(f"Conectado a PostgreSQL ({cfg['pg_host']}:{cfg['pg_port']}, usuario {cfg['pg_user']})")
    guardar_config(cfg)

    # ¿existe la base?
    _, existe, _ = pg.run(f"SELECT 1 FROM pg_database WHERE datname = '{pg.db}'", db="postgres")
    if args.reset_db and existe:
        aviso(f"--reset-db: se BORRA la base '{pg.db}'")
        pg.run(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{pg.db}' AND pid <> pg_backend_pid()", db="postgres", stop=False)
        c, _, e = pg.run(f'DROP DATABASE "{pg.db}"', db="postgres")
        if c:
            salir("No pude borrar la base (¿hay servicios conectados? ejecuta --detener antes): " + e)
        existe = ""
    creada = False
    if not existe:
        intentos = [f'CREATE DATABASE "{pg.db}" ENCODING \'UTF8\' TEMPLATE template0',
                    f'CREATE DATABASE "{pg.db}" ENCODING \'UTF8\' LC_COLLATE \'C\' LC_CTYPE \'C\' TEMPLATE template0']
        for sql in intentos:
            c, _, e = pg.run(sql, db="postgres")
            if c == 0:
                creada = True
                break
        if not creada:
            salir("No pude crear la base de datos: " + e)
        ok(f"Base '{pg.db}' creada con codificación UTF8")
    _, enc, _ = pg.run("SHOW server_encoding")
    if enc.upper() != "UTF8":
        aviso(f"La base usa la codificación {enc}. Ejecuta con --reset-db para recrearla en UTF8 (si no, los acentos pueden verse mal).")
    else:
        ok("Codificación de la base: UTF8 (acentos y ñ correctos)")

    # esquema
    _, tabla_meta, _ = pg.run("SELECT to_regclass('public.meta') IS NOT NULL")
    version = ""
    if tabla_meta == "t":
        _, version, _ = pg.run("SELECT valor FROM meta WHERE clave = 'schema_version'")
    if version == ESQUEMA_VERSION:
        ok(f"Esquema de la base al día (versión {version})")
    else:
        _, n_tablas, _ = pg.run("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
        if n_tablas not in ("", "0") and not creada:
            salir(f"La base '{pg.db}' ya tiene tablas de otra versión del proyecto. Usa --reset-db (borra y recrea) o cambia el nombre con --db-name.")
        for nombre, archivo in (("esquema", RAIZ / "database" / "schema.sql"),) + ((("datos de demostración", RAIZ / "database" / "seed.sql"),) if not args.sin_demo else ()):
            c, _, e = pg.run(archivo=archivo)
            if c:
                salir(f"Falló la carga de {nombre}: {e}")
            ok(f"Cargado: {nombre}")
    guardar_config(cfg)
    return pg


# ------------------------------------------------------------------------------------------------ red
def ip_lan():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def urls_publicas():
    """URLs con las que el navegador y el celular ven los servicios."""
    if ES_CODESPACES:
        dom = os.environ.get("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev")
        base = os.environ["CODESPACE_NAME"]
        f = lambda p: f"https://{base}-{p}.{dom}"
        return {"api": f(PUERTOS["api"]), "web": f(PUERTOS["web"]), "ia": f(PUERTOS["ia"]), "host": None}
    ip = ip_lan()
    return {"api": f"http://localhost:{PUERTOS['api']}", "web": f"http://localhost:{PUERTOS['web']}", "ia": f"http://localhost:{PUERTOS['ia']}",
            "api_lan": f"http://{ip}:{PUERTOS['api']}", "host": ip}


def puerto_abierto(p):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.6)
        return s.connect_ex(("127.0.0.1", p)) == 0


def http_ok(url, timeout=3):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status < 500
    except urllib.error.HTTPError as e:
        return e.code < 500
    except Exception:
        return False


# ------------------------------------------------------------------------------------------------ archivos .env (preserva las claves que agregues tú)
def actualizar_env(ruta: Path, valores: dict, forzar=False):
    lineas = ruta.read_text(encoding="utf-8").splitlines() if ruta.exists() else []
    vistos = set()
    for i, l in enumerate(lineas):
        m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=", l)
        if m and m.group(1) in valores:
            vistos.add(m.group(1))
            lineas[i] = f"{m.group(1)}={valores[m.group(1)]}"
    if not lineas:
        lineas.append("# Generado por iniciar.py: puedes agregar tus propias claves; iniciar.py solo actualiza las que gestiona.")
    for k, v in valores.items():
        if k not in vistos:
            lineas.append(f"{k}={v}")
    ruta.write_text("\n".join(lineas) + "\n", encoding="utf-8")


def preparar_env(cfg, pg, args):
    titulo("3. Configuración (.env)")
    cfg.setdefault("jwt_secret", secrets.token_urlsafe(36))
    guardar_config(cfg)
    u = urls_publicas()
    web_url = u["web"]
    valores_env = {
        "DATABASE_URL": pg.url(), "JWT_SECRET": cfg["jwt_secret"], "PORT": PUERTOS["api"], "FASTAPI_URL": f"http://localhost:{PUERTOS['ia']}",
        "PUBLIC_API_URL": u["api"], "PUBLIC_WEB_URL": web_url,
        "RESERVA_MAX_DIAS": "7", "RESERVA_GRACIA_HORAS": "2"}
    # PAGOS_MODO solo se fija en "sandbox" la primera vez (cuando el .env todavia
    # no existe o no tiene esa clave). En corridas siguientes se respeta el valor
    # que el usuario haya puesto a mano (p.ej. "produccion" con Stripe activado),
    # para que iniciar.py no lo pise cada vez que se vuelve a ejecutar.
    ruta_env_backend = RAIZ / "backend-nest" / ".env"
    ya_tiene_pagos_modo = ruta_env_backend.exists() and re.search(r"^\s*PAGOS_MODO\s*=", ruta_env_backend.read_text(encoding="utf-8"), re.MULTILINE)
    if not ya_tiene_pagos_modo:
        valores_env["PAGOS_MODO"] = "sandbox"
    actualizar_env(ruta_env_backend, valores_env)
    (RAIZ / "backend-nest" / "public" / "uploads").mkdir(parents=True, exist_ok=True)
    actualizar_env(RAIZ / "backend-fastapi" / ".env", {"DATABASE_URL": pg.url(), "PORT": PUERTOS["ia"], "ASSETS_DIR": "../backend-nest/public"})
    if ES_CODESPACES:
        actualizar_env(RAIZ / "frontend-web" / ".env", {"VITE_API_URL": u["api"]})
    elif not (RAIZ / "frontend-web" / ".env").exists():
        actualizar_env(RAIZ / "frontend-web" / ".env", {"VITE_API_URL": f"http://localhost:{PUERTOS['api']}"})
    # la app movil llama a la API por la IP de tu PC en la red WiFi (o la URL publica del Codespace)
    actualizar_env(RAIZ / "mobile-app" / ".env", {"EXPO_PUBLIC_API_URL": u["api"] if ES_CODESPACES else u["api_lan"]})
    ok("backend-nest/.env, backend-fastapi/.env, frontend-web/.env y mobile-app/.env listos")
    if not ES_CODESPACES:
        info(f"La app móvil usará la API en {u['api_lan']} (tu celular y tu PC deben estar en la misma red WiFi)")
    RUNTIME.mkdir(exist_ok=True)
    LOGS.mkdir(exist_ok=True)
    # PostgREST usa el MISMO secreto JWT que la API comercial
    (RUNTIME / "postgrest.conf").write_text(
        f'db-uri = "postgres://authenticator:authenticator_dev_pw@{pg.host}:{pg.port}/{pg.db}"\n'
        f'db-schemas = "public"\ndb-anon-role = "web_anon"\njwt-secret = "{cfg["jwt_secret"]}"\n'
        f'server-host = "0.0.0.0"\nserver-port = {PUERTOS["postgrest"]}\n', encoding="utf-8")


# ------------------------------------------------------------------------------------------------ dependencias
def hash_archivos(*rutas):
    h = hashlib.sha256()
    for r in rutas:
        if r.exists():
            h.update(r.read_bytes())
    return h.hexdigest()


def cargar_hashes():
    try:
        return json.loads((RUNTIME / "hashes.json").read_text())
    except Exception:
        return {}


def correr(cmd, cwd, etiqueta, env=None):
    log = LOGS / f"instalar-{etiqueta}.log"
    with open(log, "w", encoding="utf-8", errors="replace") as f:
        r = subprocess.run(cmd, cwd=cwd, stdout=f, stderr=subprocess.STDOUT, env=env)
    if r.returncode != 0:
        salir(f"Falló '{' '.join(map(str, cmd))}' en {cwd.name}. Revisa {log}")


def instalar_dependencias(req, args):
    titulo("4. Dependencias")
    RUNTIME.mkdir(exist_ok=True)
    LOGS.mkdir(exist_ok=True)
    hashes = cargar_hashes()
    npm = req["npm"]
    for carpeta in ("backend-nest", "frontend-web") + (() if args.sin_movil else ("mobile-app",)):
        d = RAIZ / carpeta
        h = hash_archivos(d / "package.json", d / "package-lock.json")
        if (d / "node_modules").exists() and hashes.get(carpeta) == h:
            ok(f"{carpeta}: dependencias al día")
            continue
        info(f"{carpeta}: instalando paquetes npm (puede tardar unos minutos la primera vez)…")
        correr([npm, "install", "--no-audit", "--no-fund", "--legacy-peer-deps"] if carpeta == "mobile-app" else [npm, "install", "--no-audit", "--no-fund"], d, carpeta)
        hashes[carpeta] = hash_archivos(d / "package.json", d / "package-lock.json")
        ok(f"{carpeta}: listo")
        (RUNTIME / "hashes.json").write_text(json.dumps(hashes))
    # compilar la API si falta o el código cambió
    api = RAIZ / "backend-nest"
    dist = api / "dist" / "main.js"
    fuentes = [p for p in (api / "src").rglob("*.ts")]
    if not dist.exists() or any(p.stat().st_mtime > dist.stat().st_mtime for p in fuentes):
        info("backend-nest: compilando…")
        correr([npm, "run", "build"], api, "nest-build")
        ok("backend-nest: compilado")
    else:
        ok("backend-nest: compilado y al día")
    # entorno virtual de la IA
    venv = RUNTIME / "venv"
    py = venv / ("Scripts/python.exe" if ES_WINDOWS else "bin/python")
    if not py.exists():
        info("backend-fastapi: creando entorno virtual…")
        correr([sys.executable, "-m", "venv", str(venv)], RAIZ, "venv")
    req_txt = RAIZ / "backend-fastapi" / "requirements.txt"
    h = hash_archivos(req_txt)
    if hashes.get("fastapi") != h:
        info("backend-fastapi: instalando paquetes de Python…")
        correr([str(py), "-m", "pip", "install", "--disable-pip-version-check", "-q", "-r", str(req_txt)], RAIZ / "backend-fastapi", "pip")
        hashes["fastapi"] = h
        (RUNTIME / "hashes.json").write_text(json.dumps(hashes))
        ok("backend-fastapi: listo")
    else:
        ok("backend-fastapi: dependencias al día")
    return str(py)


def descargar_postgrest():
    """PostgREST es opcional (capa REST de solo lectura sobre la base). Si no se puede descargar, el sistema funciona igual."""
    bin_dir = RUNTIME / "bin"
    exe = bin_dir / ("postgrest.exe" if ES_WINDOWS else "postgrest")
    if exe.exists():
        ok("PostgREST ya descargado")
        return str(exe)
    sistema = platform.system().lower()
    arq = platform.machine().lower()
    if sistema == "windows":
        clave = "windows-x86-64"
    elif sistema == "darwin":
        clave = "macos-aarch64" if arq in ("arm64", "aarch64") else "macos-x86-64"
    else:
        clave = "linux-static-aarch64" if arq in ("arm64", "aarch64") else "linux-static-x86-64"
    try:
        try:   # ultima version publicada; si la API de GitHub esta limitada se usa una version fija conocida
            req = urllib.request.Request("https://api.github.com/repos/PostgREST/postgrest/releases/latest", headers={"User-Agent": "fashionstore-launcher"})
            with urllib.request.urlopen(req, timeout=30) as r:
                rel = json.loads(r.read())
            asset = next(a for a in rel["assets"] if clave in a["name"])
            nombre_asset, url_asset, tag = asset["name"], asset["browser_download_url"], rel["tag_name"]
        except Exception:
            tag = "v16.3"
            nombre_asset = f"postgrest-{tag}-{clave}." + ("zip" if clave.startswith("windows") else "tar.xz")
            url_asset = f"https://github.com/PostgREST/postgrest/releases/download/{tag}/{nombre_asset}"
        info(f"Descargando PostgREST {tag} ({nombre_asset})…")
        bin_dir.mkdir(parents=True, exist_ok=True)
        destino = RUNTIME / nombre_asset
        with urllib.request.urlopen(urllib.request.Request(url_asset, headers={"User-Agent": "fashionstore-launcher"}), timeout=180) as r, open(destino, "wb") as f:
            shutil.copyfileobj(r, f)
        if destino.suffix == ".zip":
            with zipfile.ZipFile(destino) as z:
                z.extractall(bin_dir)
        else:
            with tarfile.open(destino) as t:
                t.extractall(bin_dir)
        destino.unlink()
        if not ES_WINDOWS:
            exe.chmod(0o755)
        ok("PostgREST instalado")
        return str(exe)
    except Exception as e:
        aviso(f"No se pudo descargar PostgREST ({e}). El sistema funciona igual; solo faltará la capa REST directa en :3001.")
        return None


# ------------------------------------------------------------------------------------------------ procesos
def leer_pids():
    try:
        return json.loads((RUNTIME / "pids.json").read_text())
    except Exception:
        return {}


def guardar_pids(p):
    RUNTIME.mkdir(exist_ok=True)
    (RUNTIME / "pids.json").write_text(json.dumps(p))


def vivo(pid):
    try:
        if ES_WINDOWS:
            r = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True, text=True)
            return str(pid) in r.stdout
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def matar(pid):
    try:
        if ES_WINDOWS:
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
        else:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
    except Exception:
        pass


def lanzar(nombre, cmd, cwd, env_extra=None):
    log = open(LOGS / f"{nombre}.log", "w", encoding="utf-8", errors="replace")
    env = os.environ.copy()
    env.update(env_extra or {})
    env["PYTHONIOENCODING"] = "utf-8"
    kw = {}
    if ES_WINDOWS:
        kw["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
    else:
        kw["start_new_session"] = True
    p = subprocess.Popen(cmd, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, env=env, **kw)
    pids = leer_pids()
    pids[nombre] = p.pid
    guardar_pids(pids)
    return p


def esperar(url, nombre, segundos=60):
    t0 = time.time()
    while time.time() - t0 < segundos:
        if http_ok(url):
            return True
        time.sleep(1)
    error(f"{nombre} no respondió a tiempo. Mira logs/{nombre}.log")
    return False


def arrancar_servicios(req, py, pgrest, args):
    titulo("5. Servicios")
    npm = req["npm"]
    node = req["node"]
    pids = leer_pids()
    detalles = []

    def servicio(nombre, puerto, url, cmd, cwd, env=None, tiempo=60):
        if puerto_abierto(puerto):
            ok(f"{nombre}: ya estaba corriendo en :{puerto}")
            return
        lanzar(nombre, cmd, cwd, env)
        detalles.append((nombre, url, tiempo))

    servicio("api", PUERTOS["api"], f"http://localhost:{PUERTOS['api']}/api/health", [node, "dist/main.js"], RAIZ / "backend-nest")
    servicio("ia", PUERTOS["ia"], f"http://localhost:{PUERTOS['ia']}/api/health", [py, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(PUERTOS["ia"])], RAIZ / "backend-fastapi")
    if pgrest:
        servicio("postgrest", PUERTOS["postgrest"], f"http://localhost:{PUERTOS['postgrest']}/", [pgrest, str(RUNTIME / "postgrest.conf")], RAIZ)
    servicio("web", PUERTOS["web"], f"http://localhost:{PUERTOS['web']}/", [npm, "run", "dev"], RAIZ / "frontend-web", tiempo=90)
    for nombre, url, t in detalles:
        if esperar(url, nombre, t):
            ok(f"{nombre}: en marcha")
    if ES_CODESPACES and shutil.which("gh"):
        # en Codespaces los puertos son privados por defecto: el navegador y el celular necesitan que sean públicos
        subprocess.run(["gh", "codespace", "ports", "visibility"] + [f"{p}:public" for p in PUERTOS.values()] + ["-c", os.environ["CODESPACE_NAME"]], capture_output=True)


def detener():
    titulo("Deteniendo servicios")
    pids = leer_pids()
    if not pids:
        info("No hay servicios registrados.")
    for nombre, pid in pids.items():
        if vivo(pid):
            matar(pid)
            ok(f"{nombre} detenido")
        else:
            info(f"{nombre}: ya no estaba corriendo")
    guardar_pids({})
    # por si quedaron procesos de una ejecución anterior (Linux/macOS)
    if not ES_WINDOWS:
        for p in PUERTOS.values():
            if puerto_abierto(p):
                subprocess.run(f"fuser -k {p}/tcp", shell=True, capture_output=True)


def estado():
    titulo("Estado de los servicios")
    for nombre, url in (("API comercial (NestJS)", f"http://localhost:{PUERTOS['api']}/api/health"), ("IA (FastAPI)", f"http://localhost:{PUERTOS['ia']}/api/health"),
                        ("PostgREST", f"http://localhost:{PUERTOS['postgrest']}/"), ("Web (React)", f"http://localhost:{PUERTOS['web']}/")):
        (ok if http_ok(url) else error)(f"{nombre}: {'en marcha' if http_ok(url) else 'apagado'}")


def resumen(args):
    u = urls_publicas()
    titulo("Listo")
    print(f"""
  Tienda web ................ {u['web']}
  Panel (personal) .......... {u['web']}/panel        (ingresa con una cuenta de personal)
  API comercial ............. {u['api']}/api/health
  IA (documentación) ........ {u['ia']}/docs
  PostgREST ................. http://localhost:{PUERTOS['postgrest']}/catalogo_publico

  Cuentas de demostración:
     cliente@fashionstore.test     Cliente123!
     admin@fashionstore.test       Admin123!
     encargado@fashionstore.test   Encargado123!
     cajero@fashionstore.test      Cajero123!
     proveedor@fashionstore.test   Proveedor123!
""")
    if ES_CODESPACES:
        info("Codespaces: abre la pestaña PORTS y confirma que los puertos 3000, 5173, 8000 y 3001 estén en modo Public.")
    if not args.sin_movil:
        info(f"App móvil: escanea el QR de Expo con Expo Go. La app llamará a la API en {u.get('api_lan', u['api'])}.")


def iniciar_expo(req, args):
    d = RAIZ / "mobile-app"
    if puerto_abierto(8081):
        ok("Expo ya está corriendo en :8081")
        return
    titulo("6. App móvil (Expo)")
    info("Se mostrará el código QR. Escanéalo con la app 'Expo Go' (celular y PC en la misma red WiFi).")
    info("Ctrl+C detiene Expo; los demás servicios siguen en segundo plano (python iniciar.py --detener para apagarlos).")
    env = os.environ.copy()
    env["EXPO_NO_TELEMETRY"] = "1"
    if ES_CODESPACES:
        env["EXPO_PACKAGER_PROXY_URL"] = urls_publicas()["api"].replace("-3000.", "-8081.")
    cmd = [shutil.which("npx") or "npx", "expo", "start", "--tunnel" if ES_CODESPACES else "--lan"]
    try:
        subprocess.run(cmd, cwd=d, env=env)
    except KeyboardInterrupt:
        pass


# ------------------------------------------------------------------------------------------------ principal
def main():
    ap = argparse.ArgumentParser(description="Lanzador de FashionStore")
    ap.add_argument("--detener", action="store_true", help="detiene los servicios en segundo plano")
    ap.add_argument("--estado", action="store_true", help="muestra qué está corriendo")
    ap.add_argument("--reset-db", action="store_true", help="BORRA y recrea la base de datos (con datos de demostración)")
    ap.add_argument("--sin-demo", action="store_true", help="al crear la base, no cargar los datos de demostración")
    ap.add_argument("--sin-movil", action="store_true", help="no instala ni arranca la app móvil (Expo)")
    ap.add_argument("--solo-preparar", action="store_true", help="instala y configura, pero no arranca servicios")
    ap.add_argument("--pg-host"), ap.add_argument("--pg-port"), ap.add_argument("--pg-user"), ap.add_argument("--pg-password"), ap.add_argument("--db-name")
    args = ap.parse_args()

    if args.detener:
        return detener()
    if args.estado:
        return estado()
    print("FashionStore · lanzador (Ctrl+C para cancelar)")
    req = comprobar_requisitos()
    if args.reset_db:
        detener()
    cfg = cargar_config()
    pg = configurar_postgres(args, req["psql"], cfg)
    preparar_env(cfg, pg, args)
    py = instalar_dependencias(req, args)
    pgrest = descargar_postgrest()
    if args.solo_preparar:
        ok("Todo preparado. Ejecuta: python iniciar.py")
        return
    arrancar_servicios(req, py, pgrest, args)
    resumen(args)
    if not args.sin_movil:
        iniciar_expo(req, args)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelado.")
        sys.exit(130)
