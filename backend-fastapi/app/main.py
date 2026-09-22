from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import db, llm
from .config import INTERNAL_KEY
from .routers import ar, asistente, recomendador, reportes


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.iniciar()
    yield
    await db.cerrar()


async def clave_interna(x_internal_key: str | None = Header(default=None)):
    """Si IA_INTERNAL_KEY esta definida, solo la API comercial (que la conoce) puede usar este servicio."""
    if INTERNAL_KEY and x_internal_key != INTERNAL_KEY:
        raise HTTPException(401, "Clave interna inválida")


app = FastAPI(
    title="FashionStore - Servicio de Inteligencia Artificial",
    description="Recomendador de prendas, asistente virtual, soporte para el vestidor AR y reportes con lenguaje natural.",
    version="2.0.0", lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

for r in (recomendador.router, asistente.router, ar.router, reportes.router):
    app.include_router(r, dependencies=[Depends(clave_interna)])


@app.get("/api/health", tags=["Sistema"])
async def health():
    async with db.pool().acquire() as con:
        n = await con.fetchval("SELECT COUNT(*) FROM productos")
    return {"ok": True, "servicio": "fashionstore-ia", "productos": n, "llm": "gemini" if llm.disponible() else "reglas"}
