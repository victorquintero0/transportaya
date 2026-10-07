ALTER TABLE "sesion" ADD COLUMN "rol" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_rol" CHECK ("sesion"."rol" in ('conductor', 'pasajero', 'interno'));