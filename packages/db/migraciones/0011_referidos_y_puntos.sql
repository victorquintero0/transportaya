CREATE TYPE "public"."estado_referido" AS ENUM('pendiente', 'otorgado', 'rechazado');--> statement-breakpoint
CREATE TYPE "public"."rol_referido" AS ENUM('pasajero', 'conductor');--> statement-breakpoint
CREATE TYPE "public"."tipo_puntos" AS ENUM('referido_referidor', 'referido_invitado', 'canje_descuento', 'canje_abono', 'reverso', 'ajuste');--> statement-breakpoint
ALTER TYPE "public"."tipo_movimiento" ADD VALUE 'descuento_puntos';--> statement-breakpoint
ALTER TYPE "public"."tipo_movimiento" ADD VALUE 'abono_puntos';--> statement-breakpoint
CREATE TABLE "movimiento_puntos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" "tipo_puntos" NOT NULL,
	"puntos" integer NOT NULL,
	"valor_punto" integer NOT NULL,
	"referido_id" uuid,
	"viaje_id" uuid,
	"movimiento_saldo_id" uuid,
	"motivo" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimiento_puntos_valor" CHECK ("movimiento_puntos"."valor_punto" > 0 and "movimiento_puntos"."puntos" <> 0),
	CONSTRAINT "movimiento_puntos_signo" CHECK (("movimiento_puntos"."tipo" in ('referido_referidor', 'referido_invitado', 'reverso') and "movimiento_puntos"."puntos" > 0)
        or ("movimiento_puntos"."tipo" in ('canje_descuento', 'canje_abono') and "movimiento_puntos"."puntos" < 0)
        or "movimiento_puntos"."tipo" = 'ajuste')
);
--> statement-breakpoint
CREATE TABLE "referido" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"referidor_id" uuid NOT NULL,
	"invitado_id" uuid NOT NULL,
	"rol_invitado" "rol_referido" NOT NULL,
	"estado" "estado_referido" DEFAULT 'pendiente' NOT NULL,
	"codigo" text NOT NULL,
	"puntos_referidor" integer DEFAULT 0 NOT NULL,
	"puntos_invitado" integer DEFAULT 0 NOT NULL,
	"viaje_id" uuid,
	"motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelto_en" timestamp with time zone,
	CONSTRAINT "referido_distintos" CHECK ("referido"."referidor_id" <> "referido"."invitado_id"),
	CONSTRAINT "referido_resuelto" CHECK (("referido"."estado" = 'pendiente') = ("referido"."resuelto_en" is null)),
	CONSTRAINT "referido_puntos" CHECK ("referido"."puntos_referidor" >= 0 and "referido"."puntos_invitado" >= 0)
);
--> statement-breakpoint
ALTER TABLE "movimiento_saldo" DROP CONSTRAINT "movimiento_signo_y_origen";--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "codigo_referido" text;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "puntos_separados" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "puntos_usados" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "descuento_puntos" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_referido_id_referido_id_fk" FOREIGN KEY ("referido_id") REFERENCES "public"."referido"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_movimiento_saldo_id_movimiento_saldo_id_fk" FOREIGN KEY ("movimiento_saldo_id") REFERENCES "public"."movimiento_saldo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referido" ADD CONSTRAINT "referido_referidor_id_usuario_id_fk" FOREIGN KEY ("referidor_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referido" ADD CONSTRAINT "referido_invitado_id_usuario_id_fk" FOREIGN KEY ("invitado_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referido" ADD CONSTRAINT "referido_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimiento_puntos_usuario_idx" ON "movimiento_puntos" USING btree ("usuario_id","creado_en");--> statement-breakpoint
CREATE INDEX "movimiento_puntos_viaje_idx" ON "movimiento_puntos" USING btree ("viaje_id") WHERE "movimiento_puntos"."viaje_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "movimiento_puntos_referido_uq" ON "movimiento_puntos" USING btree ("referido_id","tipo","usuario_id") WHERE "movimiento_puntos"."tipo" in ('referido_referidor', 'referido_invitado');--> statement-breakpoint
CREATE UNIQUE INDEX "movimiento_puntos_viaje_tipo_uq" ON "movimiento_puntos" USING btree ("viaje_id","tipo") WHERE "movimiento_puntos"."tipo" in ('canje_descuento', 'reverso') and "movimiento_puntos"."viaje_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "referido_invitado_uq" ON "referido" USING btree ("invitado_id");--> statement-breakpoint
CREATE INDEX "referido_referidor_idx" ON "referido" USING btree ("referidor_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_codigo_referido_uq" ON "usuario" USING btree ("codigo_referido");--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_codigo_referido_formato" CHECK ("usuario"."codigo_referido" is null or "usuario"."codigo_referido" ~ '^[A-Z]{2,4}-[2-9A-HJ-NP-Z]{4}$');--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_puntos_coherentes" CHECK ("viaje"."puntos_separados" >= 0 and "viaje"."puntos_usados" between 0 and "viaje"."puntos_separados"
        and "viaje"."descuento_puntos" >= 0 and ("viaje"."empresa_id" is null or "viaje"."puntos_separados" = 0));--> statement-breakpoint
ALTER TABLE "movimiento_saldo" ADD CONSTRAINT "movimiento_signo_y_origen" CHECK (case "movimiento_saldo"."tipo"::text
        when 'ingreso_viaje_electronico' then "movimiento_saldo"."monto" > 0 and "movimiento_saldo"."viaje_id" is not null
        when 'comision_viaje_efectivo' then "movimiento_saldo"."monto" < 0 and "movimiento_saldo"."viaje_id" is not null
        when 'peaje' then "movimiento_saldo"."monto" > 0 and "movimiento_saldo"."viaje_id" is not null
        when 'propina' then "movimiento_saldo"."monto" > 0 and "movimiento_saldo"."viaje_id" is not null
        when 'cancelacion' then "movimiento_saldo"."viaje_id" is not null
        when 'pago_comision' then "movimiento_saldo"."monto" > 0 and "movimiento_saldo"."pago_comision_id" is not null
        when 'pago_liquidacion' then "movimiento_saldo"."monto" < 0 and "movimiento_saldo"."pago_conductor_id" is not null
        when 'descuento_puntos' then "movimiento_saldo"."monto" > 0 and "movimiento_saldo"."viaje_id" is not null
        when 'abono_puntos' then "movimiento_saldo"."monto" > 0
        when 'ajuste' then "movimiento_saldo"."motivo" is not null and "movimiento_saldo"."creado_por" is not null
          and "movimiento_saldo"."aprobado_por" is not null and "movimiento_saldo"."aprobado_por" <> "movimiento_saldo"."creado_por"
        else false end);
--> statement-breakpoint
-- El libro de puntos solo se corrige con movimientos nuevos (RN-129), igual que el del conductor.
CREATE TRIGGER movimiento_puntos_inmutable BEFORE UPDATE OR DELETE ON movimiento_puntos
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();
--> statement-breakpoint
CREATE TRIGGER movimiento_puntos_sin_truncar BEFORE TRUNCATE ON movimiento_puntos
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion();
