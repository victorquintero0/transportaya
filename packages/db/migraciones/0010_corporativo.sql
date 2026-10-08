CREATE TYPE "public"."estado_cuenta_empresa" AS ENUM('emitido', 'pagado', 'anulado');--> statement-breakpoint
CREATE TYPE "public"."estado_empresa" AS ENUM('activa', 'suspendida');--> statement-breakpoint
CREATE TYPE "public"."estado_vinculo" AS ENUM('invitado', 'activo', 'retirado');--> statement-breakpoint
ALTER TYPE "public"."metodo_pago_viaje" ADD VALUE 'corporativo';--> statement-breakpoint
ALTER TYPE "public"."rol_interno" ADD VALUE 'empresa';--> statement-breakpoint
CREATE TABLE "empresa" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"nombre" text NOT NULL,
	"nit" text NOT NULL,
	"contacto_nombre" text NOT NULL,
	"contacto_telefono" text,
	"contacto_email" text,
	"estado" "estado_empresa" DEFAULT 'activa' NOT NULL,
	"motivo_suspension" text,
	"descuento_pb" integer DEFAULT 0 NOT NULL,
	"aplica_dinamica" boolean DEFAULT false NOT NULL,
	"cupo" bigint,
	"dia_corte" integer DEFAULT 1 NOT NULL,
	"dias_pago" integer DEFAULT 15 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresa_descuento" CHECK ("empresa"."descuento_pb" between 0 and 5000),
	CONSTRAINT "empresa_dia_corte" CHECK ("empresa"."dia_corte" between 1 and 28),
	CONSTRAINT "empresa_dias_pago" CHECK ("empresa"."dias_pago" between 0 and 90),
	CONSTRAINT "empresa_cupo" CHECK ("empresa"."cupo" is null or "empresa"."cupo" > 0)
);
--> statement-breakpoint
CREATE TABLE "centro_costo" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estado_cuenta" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"codigo" text NOT NULL,
	"empresa_id" uuid NOT NULL,
	"periodo_desde" date NOT NULL,
	"periodo_hasta" date NOT NULL,
	"viajes" integer NOT NULL,
	"subtotal" bigint NOT NULL,
	"descuento" bigint NOT NULL,
	"total" bigint NOT NULL,
	"estado" "estado_cuenta_empresa" DEFAULT 'emitido' NOT NULL,
	"emitido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"vence_en" date NOT NULL,
	"pagado_en" timestamp with time zone,
	"referencia_pago" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estado_cuenta_total" CHECK ("estado_cuenta"."total" = "estado_cuenta"."subtotal" - "estado_cuenta"."descuento"),
	CONSTRAINT "estado_cuenta_pagado" CHECK (("estado_cuenta"."estado" = 'pagado') = ("estado_cuenta"."pagado_en" is not null))
);
--> statement-breakpoint
CREATE TABLE "politica_uso" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"dias" integer[] DEFAULT '{}' NOT NULL,
	"desde_min" integer DEFAULT 0 NOT NULL,
	"hasta_min" integer DEFAULT 1440 NOT NULL,
	"monto_maximo" bigint,
	"categorias" "categoria_vehiculo"[] DEFAULT '{}' NOT NULL,
	"tipos_servicio" "tipo_servicio"[] DEFAULT '{}' NOT NULL,
	"motivo_obligatorio" boolean DEFAULT false NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "politica_uso_ventana" CHECK ("politica_uso"."desde_min" between 0 and 1439 and "politica_uso"."hasta_min" between 1 and 1440),
	CONSTRAINT "politica_uso_monto" CHECK ("politica_uso"."monto_maximo" is null or "politica_uso"."monto_maximo" > 0)
);
--> statement-breakpoint
CREATE TABLE "vinculo_empresa" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"telefono" text NOT NULL,
	"nombre" text NOT NULL,
	"usuario_id" uuid,
	"centro_costo_id" uuid,
	"politica_id" uuid,
	"estado" "estado_vinculo" DEFAULT 'invitado' NOT NULL,
	"invitado_por" uuid,
	"invitado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"aceptado_en" timestamp with time zone,
	"retirado_en" timestamp with time zone,
	CONSTRAINT "vinculo_empresa_activo_con_usuario" CHECK ("vinculo_empresa"."estado" <> 'activo' or "vinculo_empresa"."usuario_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "empleado" ADD COLUMN "empresa_id" uuid;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "empresa_id" uuid;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "vinculo_empresa_id" uuid;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "centro_costo_id" uuid;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "motivo_corporativo" text;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "descuento_corporativo" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "estado_cuenta_id" uuid;--> statement-breakpoint
ALTER TABLE "centro_costo" ADD CONSTRAINT "centro_costo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estado_cuenta" ADD CONSTRAINT "estado_cuenta_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "politica_uso" ADD CONSTRAINT "politica_uso_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_empresa" ADD CONSTRAINT "vinculo_empresa_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_empresa" ADD CONSTRAINT "vinculo_empresa_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_empresa" ADD CONSTRAINT "vinculo_empresa_centro_costo_id_centro_costo_id_fk" FOREIGN KEY ("centro_costo_id") REFERENCES "public"."centro_costo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_empresa" ADD CONSTRAINT "vinculo_empresa_politica_id_politica_uso_id_fk" FOREIGN KEY ("politica_id") REFERENCES "public"."politica_uso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_empresa" ADD CONSTRAINT "vinculo_empresa_invitado_por_empleado_usuario_id_fk" FOREIGN KEY ("invitado_por") REFERENCES "public"."empleado"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "empresa_nit_uq" ON "empresa" USING btree ("nit");--> statement-breakpoint
CREATE UNIQUE INDEX "centro_costo_codigo_uq" ON "centro_costo" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "estado_cuenta_codigo_uq" ON "estado_cuenta" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "estado_cuenta_ciclo_uq" ON "estado_cuenta" USING btree ("empresa_id","periodo_hasta");--> statement-breakpoint
CREATE INDEX "estado_cuenta_empresa_idx" ON "estado_cuenta" USING btree ("empresa_id","periodo_hasta");--> statement-breakpoint
CREATE UNIQUE INDEX "politica_uso_nombre_uq" ON "politica_uso" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "vinculo_empresa_telefono_uq" ON "vinculo_empresa" USING btree ("empresa_id","telefono") WHERE "vinculo_empresa"."estado" <> 'retirado';--> statement-breakpoint
CREATE UNIQUE INDEX "vinculo_empresa_activo_uq" ON "vinculo_empresa" USING btree ("usuario_id") WHERE "vinculo_empresa"."estado" = 'activo';--> statement-breakpoint
CREATE INDEX "vinculo_empresa_telefono_idx" ON "vinculo_empresa" USING btree ("telefono");--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_vinculo_empresa_id_vinculo_empresa_id_fk" FOREIGN KEY ("vinculo_empresa_id") REFERENCES "public"."vinculo_empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_centro_costo_id_centro_costo_id_fk" FOREIGN KEY ("centro_costo_id") REFERENCES "public"."centro_costo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_estado_cuenta_id_estado_cuenta_id_fk" FOREIGN KEY ("estado_cuenta_id") REFERENCES "public"."estado_cuenta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "empleado_empresa_idx" ON "empleado" USING btree ("empresa_id") WHERE "empleado"."empresa_id" is not null;--> statement-breakpoint
CREATE INDEX "viaje_empresa_idx" ON "viaje" USING btree ("empresa_id","solicitado_en") WHERE "viaje"."empresa_id" is not null;--> statement-breakpoint
CREATE INDEX "viaje_estado_cuenta_idx" ON "viaje" USING btree ("estado_cuenta_id") WHERE "viaje"."estado_cuenta_id" is not null;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_corporativo_coherente" CHECK (("viaje"."empresa_id" is null) = ("viaje"."vinculo_empresa_id" is null)
        and ("viaje"."empresa_id" is not null or ("viaje"."centro_costo_id" is null and "viaje"."descuento_corporativo" = 0
          and "viaje"."estado_cuenta_id" is null)));--> statement-breakpoint
CREATE TRIGGER empresa_actualizada BEFORE UPDATE ON empresa FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();--> statement-breakpoint
CREATE TRIGGER politica_uso_actualizada BEFORE UPDATE ON politica_uso FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();
