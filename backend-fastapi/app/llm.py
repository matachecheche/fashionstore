"""Cliente minimo de Gemini por REST (sin SDK). Si no hay GEMINI_API_KEY, las funciones devuelven None y el sistema usa reglas."""
import httpx

from .config import GEMINI_API_KEY, GEMINI_MODEL


def disponible() -> bool:
    return bool(GEMINI_API_KEY)


async def generar(sistema: str, mensajes: list[dict], temperatura: float = 0.4, max_tokens: int = 700) -> str | None:
    """mensajes: [{'rol': 'user'|'assistant', 'texto': '...'}]"""
    if not GEMINI_API_KEY:
        return None
    cuerpo = {
        "systemInstruction": {"parts": [{"text": sistema}]},
        "contents": [{"role": "user" if m["rol"] == "user" else "model", "parts": [{"text": m["texto"]}]} for m in mensajes],
        "generationConfig": {"temperature": temperatura, "maxOutputTokens": max_tokens},
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    try:
        async with httpx.AsyncClient(timeout=25) as cli:
            r = await cli.post(url, params={"key": GEMINI_API_KEY}, json=cuerpo)
        r.raise_for_status()
        partes = r.json()["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in partes).strip() or None
    except Exception:
        return None     # ante cualquier falla (cuota, red, formato) se cae al modo por reglas
