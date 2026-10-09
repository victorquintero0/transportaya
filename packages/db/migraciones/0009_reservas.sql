ALTER TABLE "cotizacion" ADD COLUMN "programado_para" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "reserva_conductor_id" uuid;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "reserva_tomada_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "reserva_confirmada_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "busqueda_desde" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_reserva_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("reserva_conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "viaje_reservas_idx" ON "viaje" USING btree ("programado_para") WHERE "viaje"."estado" = 'programado';--> statement-breakpoint
CREATE INDEX "viaje_reserva_conductor_idx" ON "viaje" USING btree ("reserva_conductor_id","programado_para") WHERE "viaje"."reserva_conductor_id" is not null;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_programado_con_hora" CHECK ("viaje"."estado" <> 'programado' or "viaje"."programado_para" is not null);--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_reserva_coherente" CHECK (("viaje"."reserva_tomada_en" is null) = ("viaje"."reserva_conductor_id" is null)
        and ("viaje"."reserva_confirmada_en" is null or "viaje"."reserva_conductor_id" is not null));