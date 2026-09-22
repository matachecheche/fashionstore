"""
Asistente virtual (Parte I cap. 13.2 y Parte III): responde en lenguaje natural sobre disponibilidad, tallas, recomendaciones
y sobre COMO USAR la plataforma. Las respuestas siempre se enriquecen con datos reales del catalogo.
Con GEMINI_API_KEY usa un modelo de lenguaje; sin clave funciona con un motor de reglas (asi el sistema nunca queda inutilizado).
"""
import re
import unicodedata

from fastapi import APIRouter
from pydantic import BaseModel, Field

from .. import llm
from ..catalogo import ficha, productos_activos
from ..db import filas, pool

router = APIRouter(prefix="/api/asistente", tags=["Asistente virtual"])


def norm(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


CATEGORIAS = {
    "Vestidos": ["vestido"], "Blusas": ["blusa", "camisa"], "Camisetas": ["camiseta", "remera", "polera", "playera"],
    "Pantalones": ["pantalon", "jean"], "Faldas": ["falda", "pollera"], "Chaquetas": ["chaqueta", "blazer", "abrigo", "saco", "campera"],
    "Calzado": ["zapato", "tacon", "calzado", "sandalia"], "Carteras": ["cartera", "bolso", "tote", "bolsa"],
}
COLORES = {
    "negro": "negro", "blanco": "blanco", "rojo": "rojo", "azul": "azul", "rosado": "rosado", "rosa": "rosado", "beige": "beige", "crema": "beige",
    "verde": "verde", "camel": "camel", "marron": "camel", "cafe": "camel", "gris": "gris", "celeste": "celeste", "mostaza": "mostaza",
    "amarillo": "mostaza", "dorado": "mostaza", "vino": "vino", "bordo": "vino", "granate": "vino",
}
OCASIONES = {
    "fiesta": (["Vestidos", "Calzado"], "Noches de Gala"), "gala": (["Vestidos", "Calzado"], "Noches de Gala"), "boda": (["Vestidos", "Calzado"], "Noches de Gala"),
    "cena": (["Vestidos", "Blusas"], "Noches de Gala"), "noche": (["Vestidos", "Calzado"], "Noches de Gala"),
    "oficina": (["Chaquetas", "Pantalones", "Blusas"], None), "trabajo": (["Chaquetas", "Pantalones", "Blusas"], None), "formal": (["Chaquetas", "Pantalones", "Blusas"], None),
    "casual": (["Camisetas", "Pantalones", "Faldas"], "Esencial Urbano"), "diario": (["Camisetas", "Pantalones"], "Esencial Urbano"),
    "verano": (["Vestidos", "Blusas", "Camisetas", "Faldas"], None), "calor": (["Vestidos", "Blusas", "Camisetas"], None),
    "invierno": (["Chaquetas"], "Abrigo Andino"), "frio": (["Chaquetas"], "Abrigo Andino"),
}

AYUDA = [
    (["reserv"], "Para reservar: elige la prenda, toca **Reservar**, selecciona talla, color y sucursal, indica el horario aproximado y confirma. Recibirás un código de seguimiento (RES-XXXXXX) y la reserva queda PENDIENTE; las prendas se bloquean para ti. Si algo no está disponible en esa sucursal, te sugiero otras cercanas con stock."),
    (["vestidor", "probador", "realidad aumentada", " ar "], "El vestidor virtual está en la app móvil: abre una prenda, toca **Probar en vestidor virtual**, concede permiso a la cámara y apunta hacia ti. Verás la prenda superpuesta; puedes moverla, cambiar su tamaño, cambiar de color, capturar una foto o agregarla a tu reserva."),
    (["pagar", "pago", "tarjeta", "qr", "paypal", "stripe", "libelula", "comprar"], "Para comprar: agrega prendas al carrito, toca **Ir a pagar**, elige la sucursal y el método: tarjeta o QR con Libélula, o tarjeta internacional / PayPal si pagas desde el extranjero. Al confirmarse el pago recibes tu comprobante. Si el pago es rechazado puedes reintentar con otro método."),
    (["cancel"], "Puedes cancelar una reserva PENDIENTE desde **Mis reservas** con el botón Cancelar; las prendas se liberan al instante. Si ya está en atención, pídelo en la sucursal."),
    (["devol", "cambio", "reembolso"], "Las devoluciones se registran en la sucursal: el cajero o encargado busca tu compra por comprobante, indica las prendas devueltas y el sistema reintegra el stock y te informa el monto a reembolsar."),
    (["reserva vencida", "vence", "cuanto tiempo", "cuánto tiempo"], "Tu reserva se mantiene hasta 2 horas después del horario que indicaste. Pasado ese tiempo se cancela automáticamente y las prendas vuelven al stock."),
    (["contrasena", "clave", "cuenta", "perfil", "registr"], "En **Perfil** puedes editar tus datos, tu talla habitual y colores favoritos (así mejoran tus recomendaciones) y cambiar tu contraseña. Para crear una cuenta toca **Crear cuenta** e ingresa nombre, correo y contraseña."),
    (["recomend"], "En la pantalla principal verás **Recomendadas para ti**: se calculan con tu historial (prendas vistas, probadas, reservadas y compradas), tus preferencias, la temporada actual y la disponibilidad."),
]


class Mensaje(BaseModel):
    rol: str
    texto: str


class ChatReq(BaseModel):
    mensaje: str = Field(..., min_length=1, max_length=1000)
    cliente_id: int | None = None
    sucursal_id: int | None = None
    producto_id: int | None = None
    historial: list[Mensaje] = []


def extraer(texto: str) -> dict:
    t = " " + norm(texto) + " "
    q: dict = {"categorias": [], "colores": [], "talla": None, "max": None, "min": None, "coleccion": None, "estacion": None, "ocasion": None}
    for cat, claves in CATEGORIAS.items():
        if any(re.search(rf"\b{c}", t) for c in claves):
            q["categorias"].append(cat)
    for palabra, color in COLORES.items():
        if re.search(rf"\b{palabra}\b", t) and color not in q["colores"]:
            q["colores"].append(color)
    m = re.search(r"\btalla\s*([a-z]{1,2}|\d{2})\b", t) or re.search(r"\b(xl|xs|s|m|l)\b(?=\s|$)", t)
    if m:
        q["talla"] = m.group(1).upper()
    m = re.search(r"(?:menos de|hasta|maximo|no mas de|bajo|por menos de|presupuesto de)\s*(?:bs\.?\s*)?(\d+)", t) or re.search(r"(\d+)\s*(?:bs|bolivianos)\s*(?:o menos|maximo)?", t)
    if m:
        q["max"] = float(m.group(1))
    m = re.search(r"(?:mas de|desde|minimo)\s*(?:bs\.?\s*)?(\d+)", t)
    if m:
        q["min"] = float(m.group(1))
    for palabra, (cats, col) in OCASIONES.items():
        if re.search(rf"\b{palabra}", t):
            q["ocasion"] = palabra
            if not q["categorias"]:
                q["categorias"] = list(cats)
            q["coleccion"] = col
            break
    if re.search(r"\b(oferta|descuento|promocion|rebaja|barato)", t):
        q["ofertas"] = True
    return q


def filtrar(productos: list[dict], q: dict, estricto: bool = True) -> list[dict]:
    res = []
    for p in productos:
        if p["disponible"] <= 0:
            continue
        if q["categorias"] and p["categoria"] not in q["categorias"]:
            continue
        if estricto:
            if q["colores"] and not set(q["colores"]) & set(p["colores"]):
                continue
            if q["talla"] and q["talla"] not in p["tallas_disponibles"]:
                continue
            if q["max"] and p["precioVigente"] > q["max"]:
                continue
            if q["min"] and p["precioVigente"] < q["min"]:
                continue
            if q.get("ofertas") and not p["promocion"]:
                continue
        res.append(p)
    def clave(p):
        s = 0
        if q["coleccion"] and p["coleccion"] == q["coleccion"]:
            s -= 2
        if q["ocasion"] in ("verano", "calor") and p["temporada_vigente"]:
            s -= 1
        return (s, p["precioVigente"])
    return sorted(res, key=clave)[:6]


def hay_intencion_de_producto(q: dict) -> bool:
    return bool(q["categorias"] or q["colores"] or q["talla"] or q["max"] or q["ocasion"] or q.get("ofertas"))


async def sucursales_texto() -> str:
    async with pool().acquire() as con:
        rows = filas(await con.fetch("SELECT nombre, ciudad, direccion, horario FROM sucursales WHERE activa ORDER BY ciudad, nombre"))
    return "\n".join(f"- **{r['nombre']}** ({r['ciudad']}): {r['direccion']}. Horario: {r['horario']}" for r in rows)


def resumen_producto(p: dict) -> str:
    extra = f" (antes Bs {p['precio']:.0f}, -{p['promocion']:.0f}%)" if p["promocion"] else ""
    return f"**{p['nombre']}** — Bs {p['precioVigente']:.0f}{extra}, colores: {', '.join(c.capitalize() for c in p['colores'])}, tallas con stock: {', '.join(p['tallas_disponibles']) or '—'}"


def respuesta_reglas(q: dict, prods: list[dict], relajado: bool) -> str:
    if not prods:
        return "No encontré prendas disponibles con esas características. Prueba con otra categoría, color o presupuesto, o cuéntame para qué ocasión la necesitas."
    pre = "Estas son las opciones que encontré" + (" (relajé algunos filtros para mostrarte alternativas cercanas)" if relajado else "")
    detalle = []
    if q["ocasion"]:
        detalle.append(f"para {q['ocasion']}")
    if q["colores"]:
        detalle.append("en " + "/".join(q["colores"]))
    if q["talla"]:
        detalle.append(f"talla {q['talla']}")
    if q["max"]:
        detalle.append(f"hasta Bs {q['max']:.0f}")
    cab = pre + (" " + ", ".join(detalle) if detalle else "") + ":"
    return cab + "\n" + "\n".join("• " + resumen_producto(p) for p in prods[:4]) + "\n\nToca una prenda para ver su disponibilidad por sucursal, reservarla o probártela en el vestidor virtual."


SISTEMA = """Eres el asistente virtual de FashionStore, una cadena de tiendas de ropa en Bolivia (moneda: bolivianos, Bs).
Reglas: responde SIEMPRE en español, con tono amable y breve (máximo 6 líneas). Usa ÚNICAMENTE los datos del contexto (catálogo, sucursales, ayuda);
si algo no está en el contexto, dilo con honestidad y sugiere consultar en la sucursal. Nunca inventes precios, tallas ni stock.
Puedes recomendar prendas del catálogo del contexto y explicar cómo usar la plataforma (reservas, vestidor virtual AR, compras, pagos)."""


@router.post("/chat")
async def chat(req: ChatReq):
    texto = req.mensaje.strip()
    t = " " + norm(texto) + " "
    productos = await productos_activos(req.sucursal_id)
    q = extraer(texto)
    ayuda = [resp for claves, resp in AYUDA if any(norm(c) in t for c in claves)]
    quiere_sucursales = bool(re.search(r"sucursal|horario|donde|direccion|ubicacion|tienda", t))

    prods: list[dict] = []
    relajado = False
    if hay_intencion_de_producto(q) or (req.producto_id and not ayuda):
        prods = filtrar(productos, q, True)
        if not prods:
            prods = filtrar(productos, q, False)
            relajado = bool(prods)
    if not prods and not ayuda and not quiere_sucursales and re.search(r"recomiend|sugier|que me pongo|ideas|novedad|nuevo|popular", t):
        prods = sorted([p for p in productos if p["disponible"] > 0], key=lambda p: (not p["temporada_vigente"], -p["promocion"]))[:4]

    contexto = []
    if prods:
        contexto.append("CATÁLOGO (datos reales):\n" + "\n".join("- " + resumen_producto(p) + f" [{p['categoria']}, {p['temporada']}]" for p in prods))
    if ayuda:
        contexto.append("AYUDA DE USO:\n" + "\n".join(ayuda))
    if quiere_sucursales:
        contexto.append("SUCURSALES:\n" + await sucursales_texto())

    modelo = "reglas"
    respuesta = None
    if llm.disponible():
        msgs = [{"rol": m.rol, "texto": m.texto} for m in req.historial[-8:]]
        msgs.append({"rol": "user", "texto": f"CONTEXTO:\n{chr(10).join(contexto) or '(sin datos relevantes)'}\n\nPREGUNTA DEL CLIENTE: {texto}"})
        respuesta = await llm.generar(SISTEMA, msgs)
        if respuesta:
            modelo = "gemini"
    if not respuesta:                                  # motor de reglas
        partes = []
        if ayuda:
            partes.append(ayuda[0])
        if quiere_sucursales:
            partes.append("Estas son nuestras sucursales:\n" + await sucursales_texto())
        if prods or (hay_intencion_de_producto(q) and not ayuda):
            partes.append(respuesta_reglas(q, prods, relajado))
        if not partes:
            partes.append("¡Hola! Soy el asistente de FashionStore. Puedo ayudarte a encontrar prendas (por ejemplo: «busco un vestido para una fiesta de verano» o «blusas rosadas hasta 150 Bs»), "
                          "revisar disponibilidad por sucursal y explicarte cómo reservar, probarte prendas en el vestidor virtual o pagar.")
        respuesta = "\n\n".join(partes)

    async with pool().acquire() as con:
        await con.execute("INSERT INTO conversaciones_ia (usuario_id, mensaje, respuesta, modelo) VALUES ($1,$2,$3,$4)", req.cliente_id, texto, respuesta, modelo)

    sugerencias = ["¿Cómo reservo una prenda?", "Vestidos para una fiesta", "¿Qué hay en oferta?"] if not prods else ["Ver más económicas", "¿Cómo pruebo la prenda en el vestidor?", "¿En qué sucursal hay stock?"]
    return {"respuesta": respuesta, "productos": [ficha(p) for p in prods], "modelo": modelo, "sugerencias": sugerencias}
