CREATE TABLE "ajuste_saldo" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"conductor_id" uuid NOT NULL,
	"monto" bigint NOT NULL,
	"motivo" text NOT NULL,
	"viaje_id" uuid,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"propuesto_por" uuid NOT NULL,
	"resuelto_por" uuid,
	"resuelto_en" timestamp with time zone,
	"motivo_resolucion" text,
	"movimiento_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ajuste_saldo_monto" CHECK ("ajuste_saldo"."monto" <> 0),
	CONSTRAINT "ajuste_saldo_estado_valido" CHECK ("ajuste_saldo"."estado" in ('pendiente', 'aprobado', 'rechazado')),
	CONSTRAINT "ajuste_saldo_doble_control" CHECK ("ajuste_saldo"."resuelto_por" is null or "ajuste_saldo"."resuelto_por" <> "ajuste_saldo"."propuesto_por"),
	CONSTRAINT "ajuste_saldo_resuelto" CHECK ("ajuste_saldo"."estado" = 'pendiente' or ("ajuste_saldo"."resuelto_por" is not null and "ajuste_saldo"."resuelto_en" is not null))
);
--> statement-breakpoint
ALTER TABLE "conductor" ADD COLUMN "suspension_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ajuste_saldo" ADD CONSTRAINT "ajuste_saldo_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_saldo" ADD CONSTRAINT "ajuste_saldo_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_saldo" ADD CONSTRAINT "ajuste_saldo_propuesto_por_usuario_id_fk" FOREIGN KEY ("propuesto_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_saldo" ADD CONSTRAINT "ajuste_saldo_resuelto_por_usuario_id_fk" FOREIGN KEY ("resuelto_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ajuste_saldo_estado_idx" ON "ajuste_saldo" USING btree ("estado","creado_en");--> statement-breakpoint
CREATE INDEX "ajuste_saldo_conductor_idx" ON "ajuste_saldo" USING btree ("conductor_id","creado_en");