CREATE TABLE "solicitud_datos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"rol" text NOT NULL,
	"tipo" text NOT NULL,
	"detalle" text NOT NULL,
	"estado" text DEFAULT 'recibida' NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"respuesta" text,
	"resuelta_por" uuid,
	"resuelta_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solicitud_datos_rol" CHECK ("solicitud_datos"."rol" in ('conductor', 'pasajero')),
	CONSTRAINT "solicitud_datos_tipo" CHECK ("solicitud_datos"."tipo" in ('consulta', 'rectificacion', 'supresion', 'revocatoria')),
	CONSTRAINT "solicitud_datos_estado" CHECK ("solicitud_datos"."estado" in ('recibida', 'en_tramite', 'aceptada', 'rechazada', 'ejecutada')),
	CONSTRAINT "solicitud_datos_detalle" CHECK (char_length("solicitud_datos"."detalle") between 5 and 2000),
	CONSTRAINT "solicitud_datos_resuelta" CHECK (("solicitud_datos"."estado" in ('recibida', 'en_tramite')) = ("solicitud_datos"."resuelta_en" is null)),
	CONSTRAINT "solicitud_datos_rechazo_con_respuesta" CHECK ("solicitud_datos"."estado" <> 'rechazada' or "solicitud_datos"."respuesta" is not null)
);
--> statement-breakpoint
ALTER TABLE "conductor" ADD COLUMN "acepto_terminos_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conductor" ADD COLUMN "version_terminos" text;--> statement-breakpoint
ALTER TABLE "solicitud_datos" ADD CONSTRAINT "solicitud_datos_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitud_datos" ADD CONSTRAINT "solicitud_datos_resuelta_por_empleado_usuario_id_fk" FOREIGN KEY ("resuelta_por") REFERENCES "public"."empleado"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "solicitud_datos_bandeja_idx" ON "solicitud_datos" USING btree ("estado","vence_en") WHERE "solicitud_datos"."estado" in ('recibida', 'en_tramite');--> statement-breakpoint
CREATE INDEX "solicitud_datos_usuario_idx" ON "solicitud_datos" USING btree ("usuario_id","creado_en");--> statement-breakpoint

-- Particiones de posiciones: si ya había posiciones de ese día en la partición por defecto (por ejemplo, de antes de que
-- corriera el trabajo que crea los días siguientes), PostgreSQL no deja crear la partición. Se pasan primero a la nueva.
CREATE OR REPLACE FUNCTION crear_particiones_posicion(p_desde date, p_dias integer) RETURNS integer AS $$
DECLARE
  creadas integer := 0;
  dia date;
  nombre text;
  inicio timestamptz;
  fin timestamptz;
BEGIN
  FOR i IN 0..p_dias - 1 LOOP
    dia := p_desde + i;
    nombre := 'posicion_conductor_' || to_char(dia, 'YYYYMMDD');
    IF to_regclass(nombre) IS NULL THEN
      inicio := (dia::timestamp AT TIME ZONE 'America/Bogota');
      fin := ((dia + 1)::timestamp AT TIME ZONE 'America/Bogota');
      CREATE TEMP TABLE IF NOT EXISTS _posiciones_movidas (LIKE posicion_conductor) ON COMMIT DROP;
      TRUNCATE _posiciones_movidas;
      WITH movidas AS (
        DELETE FROM posicion_conductor_otras WHERE registrada_en >= inicio AND registrada_en < fin RETURNING *
      )
      INSERT INTO _posiciones_movidas SELECT * FROM movidas;
      EXECUTE format('CREATE TABLE %I PARTITION OF posicion_conductor FOR VALUES FROM (%L) TO (%L)', nombre, inicio, fin);
      INSERT INTO posicion_conductor SELECT * FROM _posiciones_movidas;
      creadas := creadas + 1;
    END IF;
  END LOOP;
  RETURN creadas;
END;
$$ LANGUAGE plpgsql;
