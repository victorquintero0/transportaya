-- Extensiones y funciones que el esquema necesita antes de crear las tablas.

CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- UUID v7: 48 bits de marca de tiempo en milisegundos + aleatorios. Se ordena por fecha de creación,
-- lo que mantiene los índices compactos. (PostgreSQL 18 trae uuidv7() nativo; esta función
-- permite usar PostgreSQL 16.)
CREATE OR REPLACE FUNCTION uuid_v7() RETURNS uuid AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$ LANGUAGE sql VOLATILE;
--> statement-breakpoint

-- Disparador genérico: mantiene `actualizado_en`.
CREATE OR REPLACE FUNCTION fijar_actualizado_en() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Código corto legible para soporte: TY- y seis caracteres sin los que se confunden (0, O, 1, I).
CREATE OR REPLACE FUNCTION generar_codigo_viaje() RETURNS text AS $$
DECLARE
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  codigo text := 'TY-';
  i int;
BEGIN
  FOR i IN 1..6 LOOP
    codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  END LOOP;
  RETURN codigo;
END;
$$ LANGUAGE plpgsql VOLATILE;
