-- RN-045: un conductor que ya llegó y no puede continuar devuelve el viaje a despacho.
-- Mismo disparador de la migración 0002 con una transición más (en_sitio → buscando_conductor).
-- La prueba de paridad con @transportaya/dominio compara las 64 combinaciones.
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
    OR (OLD.estado = 'en_sitio' AND NEW.estado IN ('en_curso', 'buscando_conductor', 'cancelado'))
    OR (OLD.estado = 'en_curso' AND NEW.estado IN ('finalizado', 'cancelado'))
  ) THEN
    RAISE EXCEPTION 'Transición de viaje no permitida: % → %', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
