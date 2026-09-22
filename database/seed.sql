-- ============================================================================
--  FASHIONSTORE - DATOS DE DEMOSTRACION
--  Cuentas (contrasena entre parentesis):
--    admin@fashionstore.test      (Admin123!)      administrador
--    encargado@fashionstore.test  (Encargado123!)  encargado Sucursal Centro
--    encargado2@fashionstore.test (Encargado123!)  encargado Sucursal Equipetrol
--    cajero@fashionstore.test     (Cajero123!)     cajero Sucursal Centro
--    cajero2@fashionstore.test    (Cajero123!)     cajero Sucursal Equipetrol
--    proveedor@fashionstore.test  (Proveedor123!)  proveedor Textiles Oriente
--    cliente@fashionstore.test    (Cliente123!)    cliente
--  CAMBIA estas contrasenas antes de usar el sistema en serio.
-- ============================================================================
SET client_encoding = 'UTF8';

INSERT INTO sucursales (nombre, ciudad, direccion, telefono, horario, latitud, longitud) VALUES
  ('Sucursal Centro',     'Santa Cruz de la Sierra', 'Calle Libertad #120, Plaza 24 de Septiembre', '+591 3 333 0001', 'Lun-Sáb 09:00-20:00', -17.783300, -63.182100),
  ('Sucursal Equipetrol', 'Santa Cruz de la Sierra', 'Av. San Martín #450, Equipetrol',             '+591 3 333 0002', 'Lun-Dom 10:00-21:00', -17.762500, -63.196300),
  ('Sucursal Norte',      'Santa Cruz de la Sierra', 'Av. Banzer km 4, Zona Norte',                 '+591 3 333 0003', 'Lun-Sáb 10:00-20:00', -17.730000, -63.170000),
  ('Sucursal Cochabamba', 'Cochabamba',              'Av. Heroínas #345, Centro',                   '+591 4 444 0004', 'Lun-Sáb 09:30-19:30', -17.393500, -66.157000);

INSERT INTO almacenes (sucursal_id, nombre, es_tienda) VALUES
  (1, 'Tienda Centro', true), (1, 'Bodega Central', false),
  (2, 'Tienda Equipetrol', true), (3, 'Tienda Norte', true), (4, 'Tienda Cochabamba', true);

INSERT INTO proveedores (nombre, contacto, email, telefono) VALUES
  ('Textiles Oriente S.R.L.', 'Rodrigo Añez',  'ventas@textilesoriente.test', '+591 3 355 1100'),
  ('Moda Andina Ltda.',       'Patricia Quispe', 'contacto@modaandina.test',   '+591 2 240 5500'),
  ('Calzados Premium S.A.',   'Jorge Vaca',    'pedidos@calzadospremium.test', '+591 3 346 7700');

INSERT INTO usuarios (nombre, email, password_hash, rol, telefono, sucursal_id, proveedor_id) VALUES
  ('Administrador General',  'admin@fashionstore.test',      '$2a$10$oWGCeXDe5voIlzAUP3ilH.UmknrChAo7uN9GIwUK7Wbm/6169yGVq', 'admin',     '70000001', NULL, NULL),
  ('Encargada Centro',       'encargado@fashionstore.test',  '$2a$10$Lqshk9w0u/tEJTErLhCX1exlKME68zu8k630P0EZI3EjCRyLgfXvW', 'encargado', '70000002', 1, NULL),
  ('Encargado Equipetrol',   'encargado2@fashionstore.test', '$2a$10$Lqshk9w0u/tEJTErLhCX1exlKME68zu8k630P0EZI3EjCRyLgfXvW', 'encargado', '70000003', 2, NULL),
  ('Cajero Centro',          'cajero@fashionstore.test',     '$2a$10$voBFeTBRqvkYpl8ri3u1F.YdkT9WDBajFECOvKIMh9/8yK6QtVs3u', 'cajero',    '70000004', 1, NULL),
  ('Cajera Equipetrol',      'cajero2@fashionstore.test',    '$2a$10$voBFeTBRqvkYpl8ri3u1F.YdkT9WDBajFECOvKIMh9/8yK6QtVs3u', 'cajero',    '70000005', 2, NULL),
  ('Rodrigo Añez (Proveedor)','proveedor@fashionstore.test', '$2a$10$FlnKqTPlQiIvVkop05Alre1OR1Tp3OwzG/3RaiyoaFXsU57i/eaVS', 'proveedor', '70000006', NULL, 1),
  ('María Fernanda Suárez',  'cliente@fashionstore.test',    '$2a$10$rJlEUl/MfTcbmksZreOHnugxE7tY2RrPLc1mhzGmTNGR/kbrE6Mlu', 'cliente',   '71111111', NULL, NULL),
  ('Ana Lucía Pérez',        'ana@fashionstore.test',        '$2a$10$rJlEUl/MfTcbmksZreOHnugxE7tY2RrPLc1mhzGmTNGR/kbrE6Mlu', 'cliente',   '71111112', NULL, NULL),
  ('Luis Ángel Rojas',       'luis@fashionstore.test',       '$2a$10$rJlEUl/MfTcbmksZreOHnugxE7tY2RrPLc1mhzGmTNGR/kbrE6Mlu', 'cliente',   '71111113', NULL, NULL),
  ('Carla Méndez',           'carla@fashionstore.test',      '$2a$10$rJlEUl/MfTcbmksZreOHnugxE7tY2RrPLc1mhzGmTNGR/kbrE6Mlu', 'cliente',   '71111114', NULL, NULL),
  ('Diego Núñez',            'diego@fashionstore.test',      '$2a$10$rJlEUl/MfTcbmksZreOHnugxE7tY2RrPLc1mhzGmTNGR/kbrE6Mlu', 'cliente',   '71111115', NULL, NULL),
  ('Valeria Céspedes',       'valeria@fashionstore.test',    '$2a$10$rJlEUl/MfTcbmksZreOHnugxE7tY2RrPLc1mhzGmTNGR/kbrE6Mlu', 'cliente',   '71111116', NULL, NULL);

UPDATE usuarios SET preferencias = '{"tallaHabitual":"M","coloresFavoritos":["Rosado","Negro","Celeste"],"presupuestoMax":300}'::jsonb
 WHERE email = 'cliente@fashionstore.test';

INSERT INTO categorias (nombre) VALUES ('Vestidos'), ('Blusas'), ('Camisetas'), ('Pantalones'), ('Faldas'), ('Chaquetas'), ('Calzado'), ('Carteras');

INSERT INTO temporadas (nombre, fecha_inicio, fecha_fin) VALUES
  ('Otoño-Invierno 2026',   '2026-03-01', '2026-08-31'),
  ('Primavera-Verano 2026', '2026-09-01', '2027-02-28'),
  ('Escolar 2027',          '2026-12-01', '2027-03-31');

INSERT INTO colecciones (temporada_id, nombre, descripcion) VALUES
  (2, 'Flores de Primavera', 'Estampados florales y colores pastel para la nueva temporada.'),
  (2, 'Esencial Urbano',     'Básicos versátiles para el día a día en la ciudad.'),
  (2, 'Noches de Gala',      'Piezas elegantes para eventos y celebraciones.'),
  (1, 'Abrigo Andino',       'Chaquetas y abrigos inspirados en los Andes.');

-- Paleta usada por las ilustraciones de prendas (tools/generar_prendas.py)
CREATE TEMP TABLE paleta (nombre text primary key, hex text);
INSERT INTO paleta VALUES
  ('negro','#1c1c1f'),('blanco','#f1efea'),('rojo','#b3202f'),('azul','#22468a'),('rosado','#e6a1bd'),('beige','#d8c3a5'),
  ('verde','#2f6b4f'),('camel','#b98552'),('gris','#8a8d93'),('celeste','#8fc1e3'),('mostaza','#d9a12c'),('vino','#6d1f3a');

DO $$
DECLARE
  r record; pid int; c text; t text; orden_foto int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('Vestido Elegante Negro',   'Vestidos',   2, 'Noches de Gala',      1, 'vestido',  'Crepé',       'liso',      'Vestido de gala en tela crepé, corte entallado y falda amplia.',                  250.00, 190.00, ARRAY['S','M','L'],         ARRAY['negro','vino']),
      ('Vestido Floral Verano',    'Vestidos',   2, 'Flores de Primavera', 1, 'vestido',  'Viscosa',     'estampado', 'Vestido fresco de viscosa con estampado floral, ideal para el verano.',           210.00, 160.00, ARRAY['S','M','L'],         ARRAY['rosado','celeste']),
      ('Blusa Floral de Gasa',     'Blusas',     2, 'Flores de Primavera', 1, 'superior', 'Gasa',        'estampado', 'Blusa liviana de gasa con mangas amplias y cuello en V.',                          120.00,  90.00, ARRAY['S','M','L'],         ARRAY['rosado','blanco']),
      ('Blusa Satinada Clásica',   'Blusas',     2, 'Noches de Gala',      1, 'superior', 'Satén',       'satinado',  'Blusa de satén con caída fluida, perfecta para la oficina o una cena.',           135.00, 100.00, ARRAY['S','M','L'],         ARRAY['beige','vino']),
      ('Camiseta Básica Algodón',  'Camisetas',  2, 'Esencial Urbano',     2, 'superior', 'Algodón 100%','liso',      'Camiseta de algodón peinado, suave y resistente.',                                 65.00,  45.00, ARRAY['S','M','L','XL'],    ARRAY['blanco','negro','gris']),
      ('Camiseta Oversize',        'Camisetas',  2, 'Esencial Urbano',     2, 'superior', 'Algodón',     'liso',      'Camiseta de corte holgado con caída relajada.',                                    80.00,  60.00, ARRAY['M','L'],             ARRAY['mostaza','verde']),
      ('Pantalón Palazzo',         'Pantalones', 2, 'Esencial Urbano',     2, 'inferior', 'Poliéster',   'liso',      'Pantalón de pierna ancha y tiro alto, muy cómodo y elegante.',                    190.00, 145.00, ARRAY['S','M','L'],         ARRAY['negro','beige']),
      ('Pantalón Sastre',          'Pantalones', 2, 'Esencial Urbano',     2, 'inferior', 'Lana mezcla', 'liso',      'Pantalón de corte sastre con pinzas y bolsillos laterales.',                      210.00, 160.00, ARRAY['S','M','L'],         ARRAY['azul','gris']),
      ('Falda Midi Plisada',       'Faldas',     2, 'Flores de Primavera', 1, 'inferior', 'Poliéster',   'plisado',   'Falda midi plisada con cintura elástica.',                                        150.00, 110.00, ARRAY['S','M','L'],         ARRAY['mostaza','vino']),
      ('Falda Campana Azul',       'Faldas',     2, 'Esencial Urbano',     2, 'inferior', 'Denim',       'denim',     'Falda de línea A en denim ligero.',                                               140.00, 105.00, ARRAY['S','M','L'],         ARRAY['azul','celeste']),
      ('Chaqueta Casual Andina',   'Chaquetas',  1, 'Abrigo Andino',       2, 'abrigo',   'Lana',        'tejido',    'Chaqueta abrigada de lana con botones y bolsillos.',                              320.00, 250.00, ARRAY['S','M','L'],         ARRAY['verde','camel','negro']),
      ('Blazer Estructurado',      'Chaquetas',  1, 'Abrigo Andino',       2, 'abrigo',   'Poliéster',   'liso',      'Blazer estructurado de solapa ancha para looks formales.',                        380.00, 300.00, ARRAY['S','M','L'],         ARRAY['negro','gris']),
      ('Zapatos de Tacón Clásicos','Calzado',    2, 'Noches de Gala',      3, 'calzado',  'Cuero sintético','liso',   'Tacón alto forrado en cuero sintético, plantilla acolchada.',                     280.00, 220.00, ARRAY['36','37','38','39'], ARRAY['negro','rojo','beige']),
      ('Tacones Nude Fiesta',      'Calzado',    2, 'Noches de Gala',      3, 'calzado',  'Cuero',       'liso',      'Tacones color nude que combinan con todo.',                                        240.00, 190.00, ARRAY['36','37','38'],      ARRAY['beige','rosado']),
      ('Cartera de Cuero Mini',    'Carteras',   2, 'Esencial Urbano',     3, 'accesorio','Cuero',       'liso',      'Cartera de mano con correa cruzada ajustable.',                                   180.00, 140.00, ARRAY['Único'],             ARRAY['camel','negro','vino']),
      ('Cartera Tote Grande',      'Carteras',   2, 'Esencial Urbano',     3, 'accesorio','Cuero sintético','liso',   'Tote amplia con cierre magnético, cabe una laptop de 14".',                        220.00, 170.00, ARRAY['Único'],             ARRAY['azul','beige'])
    ) AS x(nombre, cat, temp, col, prov, ar, mat, tex, descr, pm, pmay, tallas, colores)
  LOOP
    INSERT INTO productos (categoria_id, temporada_id, coleccion_id, proveedor_id, nombre, descripcion, material, textura, ar_tipo, precio_menor, precio_mayor)
    VALUES (
      (SELECT id FROM categorias WHERE nombre = r.cat), r.temp,
      (SELECT id FROM colecciones WHERE nombre = r.col), r.prov,
      r.nombre, r.descr, r.mat, r.tex, r.ar, r.pm, r.pmay)
    RETURNING id INTO pid;

    orden_foto := 0;
    FOREACH c IN ARRAY r.colores LOOP
      -- archivo de ilustracion: tipo de prenda derivado del ar_tipo / categoria
      INSERT INTO producto_imagenes (producto_id, url, orden, es_overlay_ar, color) VALUES
        (pid, '/assets/prendas/' || (CASE r.cat WHEN 'Vestidos' THEN 'vestido' WHEN 'Blusas' THEN 'blusa' WHEN 'Camisetas' THEN 'camiseta'
                                                 WHEN 'Pantalones' THEN 'pantalon' WHEN 'Faldas' THEN 'falda' WHEN 'Chaquetas' THEN 'chaqueta'
                                                 WHEN 'Calzado' THEN 'zapato' ELSE 'cartera' END) || '-' || c || '-foto.jpg', orden_foto, false, initcap(c)),
        (pid, '/assets/prendas/' || (CASE r.cat WHEN 'Vestidos' THEN 'vestido' WHEN 'Blusas' THEN 'blusa' WHEN 'Camisetas' THEN 'camiseta'
                                                 WHEN 'Pantalones' THEN 'pantalon' WHEN 'Faldas' THEN 'falda' WHEN 'Chaquetas' THEN 'chaqueta'
                                                 WHEN 'Calzado' THEN 'zapato' ELSE 'cartera' END) || '-' || c || '-ar.png', 100 + orden_foto, true, initcap(c));
      orden_foto := orden_foto + 1;
      FOREACH t IN ARRAY r.tallas LOOP
        INSERT INTO variantes (producto_id, talla, color, color_hex, sku)
        VALUES (pid, t, initcap(c), (SELECT hex FROM paleta WHERE nombre = c),
                upper(left(regexp_replace(r.nombre, '[^A-Za-z]', '', 'g'), 4)) || '-' || pid || '-' || upper(t) || '-' || upper(left(c, 3)));
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- Stock inicial por almacén (distinto en cada tienda para poder probar disponibilidad y sugerencias)
INSERT INTO stock (variante_id, almacen_id, cantidad, stock_minimo)
  SELECT v.id, a.id,
         CASE a.id WHEN 1 THEN 8 + ((v.id * 5) % 9)
                   WHEN 2 THEN 20 + ((v.id * 3) % 15)
                   WHEN 3 THEN 5 + ((v.id * 7) % 10)
                   WHEN 4 THEN 2 + ((v.id * 3 + 2) % 9)
                   ELSE (v.id * 5 + 1) % 8 END,
         3
    FROM variantes v CROSS JOIN almacenes a;

INSERT INTO movimientos_inventario (variante_id, almacen_id, tipo, delta_cantidad, saldo_cantidad, saldo_reservado, nota)
  SELECT variante_id, almacen_id, 'stock_inicial', cantidad, cantidad, 0, 'Carga inicial de inventario'
    FROM stock WHERE cantidad > 0;

INSERT INTO promociones (nombre, porcentaje, temporada_id, fecha_inicio, fecha_fin)
  SELECT 'Liquidación Otoño-Invierno', 20, id, current_date - 5, current_date + 60 FROM temporadas WHERE nombre = 'Otoño-Invierno 2026';
INSERT INTO promociones (nombre, porcentaje, categoria_id, fecha_inicio, fecha_fin)
  SELECT 'Semana de las Blusas', 10, id, current_date - 2, current_date + 12 FROM categorias WHERE nombre = 'Blusas';

-- Historial de ventas de los ultimos 45 dias (para que el dashboard y los reportes tengan datos)
DO $$
#variable_conflict use_variable
DECLARE
  i int; suc int; alm int; canal text; tipo text; metodo text; tv text; cli int; vid int; vta int; n int; j int;
  pl numeric; total numeric; fecha timestamptz; cant int; clientes int[];
BEGIN
  SELECT array_agg(id) INTO clientes FROM usuarios WHERE rol = 'cliente';
  FOR i IN 1..110 LOOP
    suc := 1 + floor(random() * 4)::int;
    SELECT id INTO alm FROM almacenes WHERE sucursal_id = suc AND es_tienda;
    canal := (ARRAY['pos','pos','pos','web','app'])[1 + floor(random() * 5)::int];
    tipo := CASE WHEN canal = 'pos' THEN 'presencial' ELSE 'digital' END;
    metodo := CASE WHEN canal = 'pos' THEN (ARRAY['efectivo','efectivo','tarjeta','qr'])[1 + floor(random() * 4)::int]
                   ELSE (ARRAY['tarjeta','qr','qr','paypal'])[1 + floor(random() * 4)::int] END;
    tv := CASE WHEN canal = 'pos' AND random() < 0.1 THEN 'mayor' ELSE 'menor' END;
    cli := CASE WHEN canal = 'pos' AND random() < 0.5 THEN NULL ELSE clientes[1 + floor(random() * array_length(clientes, 1))::int] END;
    fecha := now() - (random() * 45 || ' days')::interval - (random() * 10 || ' hours')::interval;
    INSERT INTO ventas (cliente_id, sucursal_id, almacen_id, canal, tipo, tipo_venta, metodo_pago, estado, subtotal, total, creada_en)
      VALUES (cli, suc, alm, canal, tipo, tv, metodo, 'completada', 0, 0, fecha) RETURNING id INTO vta;
    total := 0;
    n := 1 + floor(random() * 3)::int;
    FOR j IN 1..n LOOP
      SELECT v.id, CASE WHEN tv = 'mayor' THEN COALESCE(p.precio_mayor, p.precio_menor) ELSE p.precio_menor END INTO vid, pl
        FROM variantes v JOIN productos p ON p.id = v.producto_id ORDER BY random() LIMIT 1;
      cant := 1 + floor(random() * 2)::int;
      INSERT INTO venta_items (venta_id, variante_id, cantidad, precio_lista, precio_unit) VALUES (vta, vid, cant, pl, pl)
        ON CONFLICT DO NOTHING;
      total := total + pl * cant;
    END LOOP;
    UPDATE ventas SET subtotal = total, total = total WHERE id = vta;
    INSERT INTO pagos (venta_id, metodo, pasarela, estado, monto, referencia, creado_en, actualizado_en)
      VALUES (vta, metodo,
              CASE WHEN canal = 'pos' THEN 'caja' WHEN metodo = 'paypal' THEN 'paypal' ELSE 'libelula' END,
              'APROBADO', total, 'SEED-' || vta, fecha, fecha);
  END LOOP;
END $$;

-- Reservas de ejemplo en distintos estados (las activas retienen stock de la tienda)
DO $$
DECLARE
  cli int; rid int;
  def record;
BEGIN
  FOR def IN
    SELECT * FROM (VALUES
      ('cliente@fashionstore.test', 1, 'PENDIENTE',   26, ARRAY[1, 7],   false),
      ('ana@fashionstore.test',     1, 'PENDIENTE',    5, ARRAY[13],     true),
      ('luis@fashionstore.test',    1, 'EN_ATENCION',  1, ARRAY[19, 21], true),
      ('carla@fashionstore.test',   2, 'PENDIENTE',   30, ARRAY[4, 5],   false),
      ('diego@fashionstore.test',   1, 'COMPLETADA', -30, ARRAY[9],      true),
      ('valeria@fashionstore.test', 3, 'CANCELADA',  -20, ARRAY[16],     false)
    ) AS x(email, suc, estado, horas, variantes, preparada)
  LOOP
    SELECT id INTO cli FROM usuarios WHERE email = def.email;
    INSERT INTO reservas (cliente_id, sucursal_id, almacen_id, fecha_hora_estimada, estado, preparada_en, vence_en, notas, motivo_cancelacion)
      VALUES (cli, def.suc, (SELECT id FROM almacenes WHERE sucursal_id = def.suc AND es_tienda),
              date_trunc('hour', now()) + (def.horas || ' hours')::interval, def.estado,
              CASE WHEN def.preparada THEN now() - interval '30 minutes' END,
              date_trunc('hour', now()) + (def.horas || ' hours')::interval + interval '2 hours',
              'Reserva de demostración',
              CASE WHEN def.estado = 'CANCELADA' THEN 'Cancelada por el cliente' END)
      RETURNING id INTO rid;
    INSERT INTO detalle_reserva (reserva_id, variante_id, cantidad) SELECT rid, unnest(def.variantes), 1;
    IF def.estado IN ('PENDIENTE', 'EN_ATENCION') THEN
      UPDATE stock SET reservado = reservado + 1
       WHERE variante_id = ANY (def.variantes) AND almacen_id = (SELECT id FROM almacenes WHERE sucursal_id = def.suc AND es_tienda);
      INSERT INTO movimientos_inventario (variante_id, almacen_id, tipo, delta_reservado, saldo_cantidad, saldo_reservado, referencia_tipo, referencia_id, nota)
        SELECT s.variante_id, s.almacen_id, 'reserva', 1, s.cantidad, s.reservado, 'reserva', rid, 'Reserva de demostración'
          FROM stock s WHERE s.variante_id = ANY (def.variantes) AND s.almacen_id = (SELECT id FROM almacenes WHERE sucursal_id = def.suc AND es_tienda);
    END IF;
  END LOOP;
END $$;

-- Recomendador: historial de navegacion de la cliente de prueba
INSERT INTO interacciones (usuario_id, producto_id, tipo, creada_en)
  SELECT u.id, x.pid, x.tipo, now() - (x.dias || ' days')::interval
    FROM usuarios u, (VALUES (2,'vista',1),(3,'vista',2),(3,'probador',2),(2,'carrito',3),(4,'vista',4),(1,'vista',5),(3,'vista',6)) AS x(pid, tipo, dias)
   WHERE u.email = 'cliente@fashionstore.test';

INSERT INTO propuestas_producto (proveedor_id, temporada_id, categoria_id, nombre, descripcion, ar_tipo, precio_sugerido, variantes)
  VALUES (1, 2, (SELECT id FROM categorias WHERE nombre = 'Vestidos'), 'Vestido Lino Verano',
          'Vestido de lino natural, cuello redondo y falda recta. Colección de verano.', 'vestido', 230,
          '[{"talla":"S","color":"Beige","colorHex":"#d8c3a5","cantidad":20},{"talla":"M","color":"Beige","colorHex":"#d8c3a5","cantidad":25},{"talla":"M","color":"Verde","colorHex":"#2f6b4f","cantidad":15}]'::jsonb);

DROP TABLE paleta;
