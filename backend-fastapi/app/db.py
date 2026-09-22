import datetime as dt
import decimal
import ssl

import asyncpg

from .config import DATABASE_SSL, DATABASE_URL

_pool: asyncpg.Pool | None = None


async def iniciar() -> None:
    global _pool
    kw = {}
    if DATABASE_SSL:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        kw["ssl"] = ctx
    # asyncpg siempre usa UTF-8 con el servidor: los acentos y la ene viajan bien
    _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=8, command_timeout=20, **kw)


async def cerrar() -> None:
    if _pool:
        await _pool.close()


def pool() -> asyncpg.Pool:
    assert _pool is not None, "El pool de base de datos no está iniciado"
    return _pool


def limpio(v):
    """Convierte tipos de PostgreSQL a tipos JSON."""
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (dt.datetime, dt.date)):
        return v.isoformat()
    return v


def filas(rows) -> list[dict]:
    return [{k: limpio(v) for k, v in dict(r).items()} for r in rows]
