-- Garantías de integridad que Drizzle no modela: inmutabilidad de los libros, máquina de estados
-- del viaje, restricciones de exclusión, índices geográficos, particiones y vistas.

-- ───────────────────────── Libros inmutables ─────────────────────────
CREATE OR REPLACE FUNCTION bloquear_modificacion() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% es un registro inmutable: no se permite % (corrija con un movimiento nuevo)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER movimiento_saldo_inmutable BEFORE UPDATE OR DELETE ON movimiento_saldo
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();
--> statement-breakpoint
CREATE TRIGGER movimiento_saldo_sin_truncar BEFORE TRUNCATE ON movimiento_saldo
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion();
--> statement-breakpoint
CREATE TRIGGER viaje_evento_inmutable BEFORE UPDATE OR DELETE ON viaje_evento
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();
--> statement-breakpoint
CREATE TRIGGER viaje_evento_sin_truncar BEFORE TRUNCATE ON viaje_evento
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion();
--> statement-breakpoint
CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();
--> statement-breakpoint
CREATE TRIGGER auditoria_sin_truncar BEFORE TRUNCATE ON auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion();
--> statement-breakpoint

-- ───────────────────────── actualizado_en ─────────────────────────
CREATE TRIGGER usuario_actualizado BEFORE UPDATE ON usuario FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();
--> statement-breakpoint
CREATE TRIGGER catalogo_vehiculo_actualizado BEFORE UPDATE ON catalogo_vehiculo FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();
--> statement-breakpoint
CREATE TRIGGER parametro_actualizado BEFORE UPDATE ON parametro FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();
--> statement-breakpoint
CREATE TRIGGER vehiculo_actualizado BEFORE UPDATE ON vehiculo FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();
--> statement-breakpoint
CREATE TRIGGER conductor_actualizado BEFORE UPDATE ON conductor FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();
--> statement-breakpoint
CREATE TRIGGER documento_actualizado BEFORE UPDATE ON documento FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();
--> statement-breakpoint
CREATE TRIGGER viaje_actualizado BEFORE UPDATE ON viaje FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();
--> statement-breakpoint
CREATE TRIGGER pago_actualizado BEFORE UPDATE ON pago FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();
--> statement-breakpoint
CREATE TRIGGER ticket_actualizado BEFORE UPDATE ON ticket FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();
--> statement-breakpoint

-- ───────────────────────── Máquina de estados del viaje ─────────────────────────
-- Replica `puedeTransitar` de @transportaya/dominio (docs/07, sección 1). Una prueba compara
-- las dos para todas las combinaciones, de modo que no puedan divergir.
CREATE OR REPLACE FUNCTION validar_transicion_viaje() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado NOT IN ('programado', 'buscando_conductor') THEN
      RAISE EXCEPTION 'Un viaje nuevo solo puede empezar en programado o buscando_conductor, no en %', NEW.estado
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado = OLD.estado THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.estado = 'programado' AND NEW.estado IN ('buscando_conductor', 'cancelado'))
    OR (OLD.estado = 'buscando_conductor' AND NEW.estado IN ('asignado', 'sin_conductor', 'cancelado'))
    OR (OLD.estado = 'asignado' AND NEW.estado IN ('en_sitio', 'buscando_conductor', 'cancelado'))
    OR (OLD.estado = 'en_sitio' AND NEW.estado IN ('en_curso', 'cancelado'))
    OR (OLD.estado = 'en_curso' AND NEW.estado IN ('finalizado', 'cancelado'))
  ) THEN
    RAISE EXCEPTION 'Transición de viaje no permitida: % → %', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER viaje_validar_transicion BEFORE INSERT OR UPDATE OF estado ON viaje
  FOR EACH ROW EXECUTE FUNCTION validar_transicion_viaje();
--> statement-breakpoint

-- ───────────────────────── Restricciones de exclusión ─────────────────────────
-- Una sola tarifa vigente por ciudad y tipo de servicio (RN-014).
ALTER TABLE tarifa ADD CONSTRAINT tarifa_sin_traslape EXCLUDE USING gist (
  ciudad_id WITH =, tipo_servicio WITH =, tstzrange(vigente_desde, vigente_hasta) WITH &&
);
--> statement-breakpoint
-- Una sola tarifa fija vigente por ruta.
ALTER TABLE ruta_fija ADD CONSTRAINT ruta_fija_sin_traslape EXCLUDE USING gist (
  ciudad_origen_id WITH =, destino WITH =, modalidad WITH =, daterange(vigente_desde, vigente_hasta) WITH &&
);
--> statement-breakpoint
-- Dos multiplicadores de dinámica no pueden coincidir en la misma zona y horario.
ALTER TABLE dinamica_zona ADD CONSTRAINT dinamica_zona_sin_traslape EXCLUDE USING gist (
  zona_id WITH =, tstzrange(desde, hasta) WITH &&
);
--> statement-breakpoint

-- ───────────────────────── Índices geográficos ─────────────────────────
CREATE INDEX ciudad_area_servicio_gix ON ciudad USING gist (area_servicio);
--> statement-breakpoint
CREATE INDEX zona_poligono_gix ON zona USING gist (poligono);
--> statement-breakpoint
CREATE INDEX cotizacion_origen_gix ON cotizacion USING gist (origen);
--> statement-breakpoint

-- ───────────────────────── Posiciones: particiones por día ─────────────────────────
-- Los días se cortan a la medianoche de Bogotá. La partición por defecto recibe lo que no tenga
-- partición propia para no perder datos; un trabajo programado debe crear los días siguientes
-- (crear_particiones_posicion) y borrar los antiguos según la retención (RNF-64).
CREATE TABLE posicion_conductor_otras PARTITION OF posicion_conductor DEFAULT;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION crear_particiones_posicion(p_desde date, p_dias integer) RETURNS integer AS $$
DECLARE
  creadas integer := 0;
  dia date;
  nombre text;
BEGIN
  FOR i IN 0..p_dias - 1 LOOP
    dia := p_desde + i;
    nombre := 'posicion_conductor_' || to_char(dia, 'YYYYMMDD');
    IF to_regclass(nombre) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF posicion_conductor FOR VALUES FROM (%L) TO (%L)',
        nombre,
        (dia::timestamp AT TIME ZONE 'America/Bogota'),
        ((dia + 1)::timestamp AT TIME ZONE 'America/Bogota')
      );
      creadas := creadas + 1;
    END IF;
  END LOOP;
  RETURN creadas;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION eliminar_particiones_posicion(p_antes_de date) RETURNS integer AS $$
DECLARE
  eliminadas integer := 0;
  hija record;
BEGIN
  FOR hija IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'posicion_conductor'::regclass
      AND c.relname ~ '^posicion_conductor_[0-9]{8}$'
      AND to_date(substr(c.relname, length('posicion_conductor_') + 1), 'YYYYMMDD') < p_antes_de
  LOOP
    EXECUTE format('DROP TABLE %I', hija.relname);
    eliminadas := eliminadas + 1;
  END LOOP;
  RETURN eliminadas;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
SELECT crear_particiones_posicion((now() AT TIME ZONE 'America/Bogota')::date, 14);
--> statement-breakpoint

-- ───────────────────────── Vistas ─────────────────────────
-- Saldo actual de cada conductor: la suma de su libro. Es la única fuente del saldo.
CREATE VIEW saldo_conductor AS
SELECT c.usuario_id AS conductor_id,
       COALESCE(sum(m.monto), 0)::bigint AS saldo,
       count(m.id)::integer AS movimientos,
       max(m.creado_en) AS ultimo_movimiento_en
FROM conductor c
LEFT JOIN movimiento_saldo m ON m.conductor_id = c.usuario_id
GROUP BY c.usuario_id;
--> statement-breakpoint

-- Tiempos de cada viaje (OPE-03): asignación, llegada, espera, viaje y total de servicio.
CREATE VIEW viaje_tiempos AS
SELECT v.id AS viaje_id,
       v.conductor_id,
       v.estado,
       v.solicitado_en,
       extract(epoch FROM (v.aceptado_en - v.solicitado_en))::integer AS asignacion_s,
       extract(epoch FROM (v.en_sitio_en - v.aceptado_en))::integer AS llegada_s,
       extract(epoch FROM (v.iniciado_en - v.en_sitio_en))::integer AS espera_s,
       extract(epoch FROM (v.finalizado_en - v.iniciado_en))::integer AS viaje_s,
       extract(epoch FROM (v.finalizado_en - v.solicitado_en))::integer AS total_servicio_s,
       v.tiempo_detenido_s,
       v.distancia_real_m
FROM viaje v;
