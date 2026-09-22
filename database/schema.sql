-- ============================================================================
--  FASHIONSTORE - ESQUEMA DE BASE DE DATOS (PostgreSQL 13+)
--  Solo estructura (tablas, restricciones, vistas, roles de PostgREST).
--  Los datos de demostracion estan en database/seed.sql.
--
--  IMPORTANTE (acentos y ene): este archivo esta en UTF-8. Se fuerza la
--  codificacion del cliente para que Windows no lo interprete como WIN1252.
-- ============================================================================
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

CREATE TABLE meta (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
INSERT INTO meta (clave, valor) VALUES ('schema_version', '2');

-- ---------------------------------------------------------------- Organizacion
CREATE TABLE sucursales (
  id         SERIAL PRIMARY KEY,
  nombre     VARCHAR(120) NOT NULL,
  ciudad     VARCHAR(80)  NOT NULL,
  direccion  VARCHAR(200),
  telefono   VARCHAR(30),
  horario    VARCHAR(120) DEFAULT 'Lun-Sáb 09:00-20:00',
  latitud    NUMERIC(9,6),
  longitud   NUMERIC(9,6),
  activa     BOOLEAN NOT NULL DEFAULT true,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE almacenes (
  id          SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  nombre      VARCHAR(120) NOT NULL,
  es_tienda   BOOLEAN NOT NULL DEFAULT false,  -- true = almacén de venta directa (piso de tienda)
  activo      BOOLEAN NOT NULL DEFAULT true
);
-- cada sucursal tiene exactamente un almacén "tienda": es el que vende y reserva
CREATE UNIQUE INDEX ux_una_tienda_por_sucursal ON almacenes (sucursal_id) WHERE es_tienda;

CREATE TABLE proveedores (
  id        SERIAL PRIMARY KEY,
  nombre    VARCHAR(160) NOT NULL,
  contacto  VARCHAR(120),
  email     VARCHAR(160),
  telefono  VARCHAR(30),
  activo    BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Usuarios
CREATE TABLE usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  email         VARCHAR(160) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol           VARCHAR(20) NOT NULL DEFAULT 'cliente'
                CHECK (rol IN ('admin','encargado','cajero','proveedor','cliente')),
  telefono      VARCHAR(30),
  documento     VARCHAR(30),                       -- CI / NIT para el comprobante
  activo        BOOLEAN NOT NULL DEFAULT true,
  sucursal_id   INTEGER REFERENCES sucursales(id) ON DELETE SET NULL,   -- encargado / cajero
  proveedor_id  INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,  -- usuario proveedor
  preferencias  JSONB NOT NULL DEFAULT '{}'::jsonb,                     -- talla habitual, colores favoritos...
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acceso TIMESTAMPTZ
);

-- ---------------------------------------------------------------- Catalogo
CREATE TABLE categorias (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  activa BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE temporadas (
  id           SERIAL PRIMARY KEY,
  nombre       VARCHAR(100) NOT NULL UNIQUE,
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE NOT NULL,
  activa       BOOLEAN NOT NULL DEFAULT true,
  CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE colecciones (
  id           SERIAL PRIMARY KEY,
  temporada_id INTEGER NOT NULL REFERENCES temporadas(id) ON DELETE CASCADE,
  nombre       VARCHAR(120) NOT NULL,
  descripcion  TEXT,
  activa       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (temporada_id, nombre)
);

CREATE TABLE productos (
  id            SERIAL PRIMARY KEY,
  categoria_id  INTEGER REFERENCES categorias(id),
  temporada_id  INTEGER REFERENCES temporadas(id),
  coleccion_id  INTEGER REFERENCES colecciones(id),
  proveedor_id  INTEGER REFERENCES proveedores(id),
  nombre        VARCHAR(160) NOT NULL,
  descripcion   TEXT,
  material      VARCHAR(120),
  textura       VARCHAR(40) DEFAULT 'liso',       -- liso, estampado, denim, satinado... (dato para el motor AR)
  ar_tipo       VARCHAR(20) NOT NULL DEFAULT 'superior'
                CHECK (ar_tipo IN ('superior','inferior','vestido','abrigo','calzado','accesorio')),
  precio_menor  NUMERIC(10,2) NOT NULL CHECK (precio_menor > 0),
  precio_mayor  NUMERIC(10,2),
  activo        BOOLEAN NOT NULL DEFAULT true,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (precio_mayor IS NULL OR precio_mayor <= precio_menor)
);
CREATE INDEX idx_productos_categoria ON productos (categoria_id);
CREATE INDEX idx_productos_temporada ON productos (temporada_id);

CREATE TABLE producto_imagenes (
  id            SERIAL PRIMARY KEY,
  producto_id   INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  orden         INTEGER NOT NULL DEFAULT 0,
  es_overlay_ar BOOLEAN NOT NULL DEFAULT false,   -- PNG con fondo transparente para el vestidor AR
  color         VARCHAR(40)                       -- color al que corresponde la imagen (opcional)
);

-- Variante = combinación talla x color, con SKU propio
CREATE TABLE variantes (
  id          SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  talla       VARCHAR(10) NOT NULL,
  color       VARCHAR(40) NOT NULL,
  color_hex   VARCHAR(7) NOT NULL DEFAULT '#888888',
  sku         VARCHAR(60) UNIQUE NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (producto_id, talla, color)
);

CREATE TABLE promociones (
  id           SERIAL PRIMARY KEY,
  nombre       VARCHAR(120) NOT NULL,
  porcentaje   NUMERIC(5,2) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 90),
  producto_id  INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE CASCADE,
  temporada_id INTEGER REFERENCES temporadas(id) ON DELETE CASCADE,
  fecha_inicio DATE NOT NULL DEFAULT current_date,
  fecha_fin    DATE NOT NULL DEFAULT (current_date + 30),
  activa       BOOLEAN NOT NULL DEFAULT true,
  CHECK (fecha_fin >= fecha_inicio)
);

-- ---------------------------------------------------------------- Inventario
-- cantidad = existencias físicas; reservado = retenido por reservas o pagos en curso.
-- disponible = cantidad - reservado
CREATE TABLE stock (
  variante_id          INTEGER NOT NULL REFERENCES variantes(id) ON DELETE CASCADE,
  almacen_id           INTEGER NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
  cantidad             INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  reservado            INTEGER NOT NULL DEFAULT 0 CHECK (reservado >= 0),
  stock_minimo         INTEGER NOT NULL DEFAULT 3 CHECK (stock_minimo >= 0),
  reposicion_estimada  DATE,
  PRIMARY KEY (variante_id, almacen_id),
  CHECK (reservado <= cantidad)
);
CREATE INDEX idx_stock_almacen ON stock (almacen_id);

-- Historial de movimientos (trazabilidad, CU-10)
CREATE TABLE movimientos_inventario (
  id               BIGSERIAL PRIMARY KEY,
  variante_id      INTEGER NOT NULL REFERENCES variantes(id),
  almacen_id       INTEGER NOT NULL REFERENCES almacenes(id),
  tipo             VARCHAR(30) NOT NULL CHECK (tipo IN (
                     'recepcion','venta','reserva','liberacion_reserva','retencion_pago','liberacion_pago',
                     'devolucion','ajuste','merma','transferencia_salida','transferencia_entrada','stock_inicial')),
  delta_cantidad   INTEGER NOT NULL DEFAULT 0,
  delta_reservado  INTEGER NOT NULL DEFAULT 0,
  saldo_cantidad   INTEGER NOT NULL,
  saldo_reservado  INTEGER NOT NULL,
  referencia_tipo  VARCHAR(30),
  referencia_id    INTEGER,
  usuario_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  nota             TEXT,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mov_variante ON movimientos_inventario (variante_id, almacen_id, creado_en DESC);
CREATE INDEX idx_mov_fecha ON movimientos_inventario (creado_en DESC);

CREATE TABLE recepciones (
  id           SERIAL PRIMARY KEY,
  proveedor_id INTEGER REFERENCES proveedores(id),
  almacen_id   INTEGER NOT NULL REFERENCES almacenes(id),
  usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  nota         TEXT,
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE recepcion_items (
  id           SERIAL PRIMARY KEY,
  recepcion_id INTEGER NOT NULL REFERENCES recepciones(id) ON DELETE CASCADE,
  variante_id  INTEGER NOT NULL REFERENCES variantes(id),
  cantidad     INTEGER NOT NULL CHECK (cantidad > 0)
);

-- ---------------------------------------------------------------- Cajas (POS)
CREATE TABLE cajas (
  id             SERIAL PRIMARY KEY,
  almacen_id     INTEGER NOT NULL REFERENCES almacenes(id),
  sucursal_id    INTEGER NOT NULL REFERENCES sucursales(id),
  cajero_id      INTEGER NOT NULL REFERENCES usuarios(id),
  monto_apertura NUMERIC(10,2) NOT NULL CHECK (monto_apertura >= 0),
  monto_cierre   NUMERIC(10,2),
  monto_esperado NUMERIC(10,2),
  estado         VARCHAR(10) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
  abierta_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrada_en     TIMESTAMPTZ
);
CREATE UNIQUE INDEX ux_una_caja_abierta_por_cajero ON cajas (cajero_id) WHERE estado = 'abierta';

-- ---------------------------------------------------------------- Reservas
CREATE TABLE reservas (
  id                   SERIAL PRIMARY KEY,
  codigo               VARCHAR(16) UNIQUE NOT NULL
                       DEFAULT ('RES-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))),
  cliente_id           INTEGER NOT NULL REFERENCES usuarios(id),
  sucursal_id          INTEGER NOT NULL REFERENCES sucursales(id),
  almacen_id           INTEGER NOT NULL REFERENCES almacenes(id),
  fecha_hora_estimada  TIMESTAMPTZ NOT NULL,
  estado               VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE'
                       CHECK (estado IN ('PENDIENTE','EN_ATENCION','COMPLETADA','CANCELADA')),
  preparada_en         TIMESTAMPTZ,
  atendida_por         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  notas                TEXT,
  motivo_cancelacion   TEXT,
  vence_en             TIMESTAMPTZ NOT NULL,
  venta_id             INTEGER,
  creada_en            TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reservas_sucursal_estado ON reservas (sucursal_id, estado);
CREATE INDEX idx_reservas_cliente ON reservas (cliente_id, creada_en DESC);

CREATE TABLE detalle_reserva (
  id          SERIAL PRIMARY KEY,
  reserva_id  INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  variante_id INTEGER NOT NULL REFERENCES variantes(id),
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0),
  UNIQUE (reserva_id, variante_id)
);

-- ---------------------------------------------------------------- Ventas y pagos
CREATE SEQUENCE seq_comprobante START 1;

CREATE TABLE ventas (
  id                 SERIAL PRIMARY KEY,
  numero_comprobante VARCHAR(20) UNIQUE NOT NULL
                     DEFAULT ('FS-' || lpad(nextval('seq_comprobante')::text, 6, '0')),
  cliente_id         INTEGER REFERENCES usuarios(id),
  sucursal_id        INTEGER NOT NULL REFERENCES sucursales(id),
  almacen_id         INTEGER NOT NULL REFERENCES almacenes(id),
  caja_id            INTEGER REFERENCES cajas(id),
  reserva_id         INTEGER REFERENCES reservas(id),
  canal              VARCHAR(10) NOT NULL CHECK (canal IN ('web','app','pos')),
  tipo               VARCHAR(12) NOT NULL CHECK (tipo IN ('presencial','digital')),
  tipo_venta         VARCHAR(8)  NOT NULL DEFAULT 'menor' CHECK (tipo_venta IN ('mayor','menor')),
  metodo_pago        VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('efectivo','tarjeta','qr','transferencia','contra_entrega','paypal')),
  estado             VARCHAR(20) NOT NULL DEFAULT 'completada'
                     CHECK (estado IN ('pendiente_pago','pendiente','completada','entregada','cancelada','devuelta_parcial','devuelta')),
  subtotal           NUMERIC(10,2) NOT NULL,
  descuento          NUMERIC(10,2) NOT NULL DEFAULT 0,
  total              NUMERIC(10,2) NOT NULL,
  moneda             VARCHAR(3) NOT NULL DEFAULT 'BOB',
  documento_cliente  VARCHAR(30),
  notas              TEXT,
  creada_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- id generado en el dispositivo antes de tener conexión; UNIQUE evita duplicar la venta al reintentar
  origen_offline_id  TEXT UNIQUE
);
CREATE INDEX idx_ventas_sucursal_fecha ON ventas (sucursal_id, creada_en);
CREATE INDEX idx_ventas_cliente ON ventas (cliente_id, creada_en DESC);
CREATE INDEX idx_ventas_estado ON ventas (estado);
ALTER TABLE reservas ADD CONSTRAINT fk_reserva_venta FOREIGN KEY (venta_id) REFERENCES ventas(id);

CREATE TABLE venta_items (
  id             SERIAL PRIMARY KEY,
  venta_id       INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  variante_id    INTEGER NOT NULL REFERENCES variantes(id),
  cantidad       INTEGER NOT NULL CHECK (cantidad > 0),
  precio_lista   NUMERIC(10,2) NOT NULL,   -- precio antes de promociones
  precio_unit    NUMERIC(10,2) NOT NULL    -- precio realmente cobrado
);

CREATE TABLE pagos (
  id                 SERIAL PRIMARY KEY,
  venta_id           INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  metodo             VARCHAR(20) NOT NULL,
  pasarela           VARCHAR(20) NOT NULL CHECK (pasarela IN ('libelula','stripe','paypal','caja','contra_entrega','sandbox')),
  estado             VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE'
                     CHECK (estado IN ('PENDIENTE','APROBADO','RECHAZADO','EXPIRADO','REEMBOLSADO')),
  monto              NUMERIC(10,2) NOT NULL,
  moneda             VARCHAR(3) NOT NULL DEFAULT 'BOB',
  referencia         VARCHAR(40) UNIQUE NOT NULL,   -- nuestra referencia (se envía a la pasarela)
  referencia_externa TEXT,                          -- id de la sesión/orden en la pasarela
  checkout_url       TEXT,
  qr_texto           TEXT,
  motivo_rechazo     TEXT,
  expira_en          TIMESTAMPTZ,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pagos_venta ON pagos (venta_id);

CREATE TABLE devoluciones (
  id         SERIAL PRIMARY KEY,
  venta_id   INTEGER NOT NULL REFERENCES ventas(id),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  motivo     TEXT,
  monto      NUMERIC(10,2) NOT NULL,
  creada_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE devolucion_items (
  id            SERIAL PRIMARY KEY,
  devolucion_id INTEGER NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,
  variante_id   INTEGER NOT NULL REFERENCES variantes(id),
  cantidad      INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unit   NUMERIC(10,2) NOT NULL
);

-- ---------------------------------------------------------------- Proveedores: propuestas
CREATE TABLE propuestas_producto (
  id              SERIAL PRIMARY KEY,
  proveedor_id    INTEGER NOT NULL REFERENCES proveedores(id),
  temporada_id    INTEGER REFERENCES temporadas(id),
  coleccion_id    INTEGER REFERENCES colecciones(id),
  categoria_id    INTEGER REFERENCES categorias(id),
  nombre          VARCHAR(160) NOT NULL,
  descripcion     TEXT,
  ar_tipo         VARCHAR(20) NOT NULL DEFAULT 'superior',
  precio_sugerido NUMERIC(10,2) NOT NULL CHECK (precio_sugerido > 0),
  variantes       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{talla,color,colorHex,cantidad}]
  imagen_url      TEXT,
  estado          VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA')),
  motivo_rechazo  TEXT,
  producto_id     INTEGER REFERENCES productos(id),
  creada_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelta_en     TIMESTAMPTZ
);

-- ---------------------------------------------------------------- Inteligencia artificial
CREATE TABLE interacciones (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  tipo        VARCHAR(15) NOT NULL CHECK (tipo IN ('vista','probador','carrito','reserva','compra','busqueda')),
  detalle     TEXT,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_interacciones_usuario ON interacciones (usuario_id, creada_en DESC);

CREATE TABLE recomendaciones_ia (
  id          BIGSERIAL PRIMARY KEY,
  cliente_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  score       NUMERIC(6,3) NOT NULL,
  motivo      TEXT,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reco_cliente ON recomendaciones_ia (cliente_id, creada_en DESC);

CREATE TABLE conversaciones_ia (
  id         BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  mensaje    TEXT NOT NULL,
  respuesta  TEXT NOT NULL,
  modelo     VARCHAR(60),
  creada_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Notificaciones y auditoria
CREATE TABLE notificaciones (
  id              SERIAL PRIMARY KEY,
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo            VARCHAR(30) NOT NULL,
  titulo          VARCHAR(160) NOT NULL,
  mensaje         TEXT,
  referencia_tipo VARCHAR(30),
  referencia_id   INTEGER,
  leida           BOOLEAN NOT NULL DEFAULT false,
  creada_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_usuario ON notificaciones (usuario_id, leida, creada_en DESC);

CREATE TABLE auditoria (
  id         BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  accion     VARCHAR(60) NOT NULL,
  entidad    VARCHAR(40),
  entidad_id INTEGER,
  detalle    JSONB,
  creada_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
--  VISTAS (las usa PostgREST y tambien los reportes)
-- ============================================================================

-- Disponibilidad de cada variante por sucursal (solo almacén "tienda")
CREATE OR REPLACE VIEW disponibilidad_sucursal AS
  SELECT v.producto_id, v.id AS variante_id, v.talla, v.color, v.color_hex, v.sku,
         su.id AS sucursal_id, su.nombre AS sucursal, su.ciudad,
         GREATEST(s.cantidad - s.reservado, 0) AS disponible,
         s.reposicion_estimada
    FROM stock s
    JOIN almacenes a ON a.id = s.almacen_id AND a.es_tienda AND a.activo
    JOIN sucursales su ON su.id = a.sucursal_id AND su.activa
    JOIN variantes v ON v.id = s.variante_id AND v.activo;

CREATE OR REPLACE VIEW catalogo_publico AS
  SELECT p.id, p.nombre, p.descripcion, p.precio_menor, p.precio_mayor, p.ar_tipo, p.textura,
         p.categoria_id, c.nombre AS categoria,
         p.temporada_id, t.nombre AS temporada,
         p.coleccion_id, co.nombre AS coleccion,
         (SELECT pi.url FROM producto_imagenes pi
           WHERE pi.producto_id = p.id AND NOT pi.es_overlay_ar
           ORDER BY pi.orden, pi.id LIMIT 1) AS imagen,
         COALESCE((SELECT SUM(d.disponible) FROM disponibilidad_sucursal d WHERE d.producto_id = p.id), 0)::int AS stock_total
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN temporadas t ON t.id = p.temporada_id
    LEFT JOIN colecciones co ON co.id = p.coleccion_id
   WHERE p.activo = true;

CREATE OR REPLACE VIEW inventario_critico AS
  SELECT p.id AS producto_id, p.nombre AS producto, v.id AS variante_id, v.talla, v.color, v.sku,
         su.id AS sucursal_id, su.nombre AS sucursal, a.id AS almacen_id, a.nombre AS almacen,
         s.cantidad, s.reservado, GREATEST(s.cantidad - s.reservado, 0) AS disponible, s.stock_minimo,
         CASE WHEN s.cantidad - s.reservado <= 0 THEN 'agotado' ELSE 'critico' END AS estado
    FROM stock s
    JOIN variantes v ON v.id = s.variante_id AND v.activo
    JOIN productos p ON p.id = v.producto_id AND p.activo
    JOIN almacenes a ON a.id = s.almacen_id AND a.activo
    JOIN sucursales su ON su.id = a.sucursal_id
   WHERE s.cantidad - s.reservado <= s.stock_minimo;

-- ============================================================================
--  POSTGREST - roles y permisos
--  ---------------------------------------------------------------------------
--  PostgREST expone la base como API REST (puerto 3001) sin escribir
--  controladores. Convive con los backends asi:
--    * Lectura publica (catalogo, disponibilidad, sucursales) -> PostgREST
--    * CRUD simple de admin (categorias, temporadas...)        -> PostgREST o NestJS
--    * Logica transaccional (reservas, ventas, pagos, stock)   -> NestJS
--    * IA (recomendador, chatbot, Text-to-SQL, AR)             -> FastAPI
--  La tabla "usuarios" NO se expone por PostgREST: el password_hash jamas sale por ahi.
--  NestJS firma el JWT con el claim "role" (app_admin, app_encargado, ...) y el
--  mismo JWT_SECRET que PostgREST, de modo que PostgREST hace SET ROLE segun ese claim.
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'authenticator_dev_pw';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_anon')      THEN CREATE ROLE web_anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_cliente')   THEN CREATE ROLE app_cliente NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_proveedor') THEN CREATE ROLE app_proveedor NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_cajero')    THEN CREATE ROLE app_cajero NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_encargado') THEN CREATE ROLE app_encargado NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin')     THEN CREATE ROLE app_admin NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_reportes')  THEN CREATE ROLE app_reportes NOLOGIN; END IF;
END $$;

GRANT web_anon, app_cliente, app_proveedor, app_cajero, app_encargado, app_admin TO authenticator;
GRANT web_anon      TO app_cliente;
GRANT app_cliente   TO app_proveedor;
GRANT app_cliente   TO app_cajero;
GRANT app_cajero    TO app_encargado;
GRANT app_encargado TO app_admin;

GRANT USAGE ON SCHEMA public TO web_anon, app_cliente, app_proveedor, app_cajero, app_encargado, app_admin, app_reportes;

-- Lectura publica
GRANT SELECT ON catalogo_publico, disponibilidad_sucursal, categorias, temporadas, colecciones, sucursales TO web_anon;
-- Personal de tienda
GRANT SELECT ON productos, producto_imagenes, variantes, stock, almacenes, inventario_critico TO app_cajero;
GRANT SELECT ON movimientos_inventario, proveedores, promociones TO app_encargado;
-- Admin: CRUD directo sobre tablas maestras
GRANT INSERT, UPDATE, DELETE ON categorias, temporadas, colecciones, sucursales, almacenes, proveedores, promociones TO app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON productos, producto_imagenes, variantes TO app_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_admin;

-- Ventas y reservas: cada cliente ve solo lo suyo (RLS); el personal ve todo
GRANT SELECT ON ventas, venta_items, pagos, reservas, detalle_reserva TO app_cliente;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_reserva ENABLE ROW LEVEL SECURITY;

CREATE POLICY ventas_propias ON ventas FOR SELECT TO app_cliente
  USING (cliente_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::int);
CREATE POLICY ventas_personal ON ventas FOR SELECT TO app_cajero, app_encargado, app_admin USING (true);
CREATE POLICY venta_items_visibles ON venta_items FOR SELECT TO app_cliente, app_cajero, app_encargado, app_admin
  USING (venta_id IN (SELECT id FROM ventas));
CREATE POLICY pagos_visibles ON pagos FOR SELECT TO app_cliente, app_cajero, app_encargado, app_admin
  USING (venta_id IN (SELECT id FROM ventas));
CREATE POLICY reservas_propias ON reservas FOR SELECT TO app_cliente
  USING (cliente_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::int);
CREATE POLICY reservas_personal ON reservas FOR SELECT TO app_cajero, app_encargado, app_admin USING (true);
CREATE POLICY detalle_reserva_visible ON detalle_reserva FOR SELECT TO app_cliente, app_cajero, app_encargado, app_admin
  USING (reserva_id IN (SELECT id FROM reservas));

GRANT SELECT ON cajas TO app_cajero;
ALTER TABLE cajas ENABLE ROW LEVEL SECURITY;
CREATE POLICY cajas_propias ON cajas FOR SELECT TO app_cajero
  USING (cajero_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::int);
CREATE POLICY cajas_todas ON cajas FOR SELECT TO app_encargado, app_admin USING (true);

-- Rol de solo lectura para los reportes con IA (Text-to-SQL): jamas ve usuarios.password_hash
GRANT SELECT ON sucursales, almacenes, categorias, temporadas, colecciones, proveedores, productos, variantes, stock,
                movimientos_inventario, reservas, detalle_reserva, ventas, venta_items, pagos, devoluciones,
                devolucion_items, cajas, promociones, interacciones, recomendaciones_ia,
                disponibilidad_sucursal, catalogo_publico, inventario_critico TO app_reportes;
GRANT SELECT (id, nombre, email, rol, telefono, sucursal_id, creado_en) ON usuarios TO app_reportes;
-- las tablas con RLS necesitan politica explicita: el rol de reportes puede leer todas las filas (solo lectura)
CREATE POLICY reportes_ventas ON ventas FOR SELECT TO app_reportes USING (true);
CREATE POLICY reportes_venta_items ON venta_items FOR SELECT TO app_reportes USING (true);
CREATE POLICY reportes_pagos ON pagos FOR SELECT TO app_reportes USING (true);
CREATE POLICY reportes_reservas ON reservas FOR SELECT TO app_reportes USING (true);
CREATE POLICY reportes_detalle_reserva ON detalle_reserva FOR SELECT TO app_reportes USING (true);
CREATE POLICY reportes_cajas ON cajas FOR SELECT TO app_reportes USING (true);
DO $$ BEGIN
  EXECUTE format('GRANT app_reportes TO %I', current_user);   -- el backend de IA hace SET ROLE app_reportes
END $$;
