CREATE TABLE "peaje" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"nombre" text NOT NULL,
	"ubicacion" geography(Point,4326) NOT NULL,
	"valor" bigint NOT NULL,
	"fuente" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "peaje_valor" CHECK ("peaje"."valor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "peaje_nombre_uq" ON "peaje" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "peaje_ubicacion_gix" ON "peaje" USING gist ("ubicacion");--> statement-breakpoint
CREATE TRIGGER peaje_actualizado BEFORE UPDATE ON peaje FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();
