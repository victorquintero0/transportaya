CREATE TYPE "public"."actor_tipo" AS ENUM('pasajero', 'conductor', 'operacion', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."categoria_vehiculo" AS ENUM('media', 'media_alta', 'alta');--> statement-breakpoint
CREATE TYPE "public"."estado_alerta" AS ENUM('abierta', 'tomada', 'cerrada');--> statement-breakpoint
CREATE TYPE "public"."estado_cierre" AS ENUM('abierto', 'por_pagar', 'por_cobrar', 'pagado', 'cobrado', 'sin_movimiento');--> statement-breakpoint
CREATE TYPE "public"."estado_conciliacion" AS ENUM('pendiente', 'conciliado', 'rechazado');--> statement-breakpoint
CREATE TYPE "public"."estado_documento" AS ENUM('pendiente', 'aprobado', 'rechazado', 'vencido');--> statement-breakpoint
CREATE TYPE "public"."estado_habilitacion" AS ENUM('registro_incompleto', 'en_revision', 'rechazado', 'habilitado', 'suspendido', 'bloqueado');--> statement-breakpoint
CREATE TYPE "public"."estado_operativo" AS ENUM('desconectado', 'disponible', 'con_oferta', 'en_camino', 'en_sitio', 'en_viaje', 'sin_senal');--> statement-breakpoint
CREATE TYPE "public"."estado_pago" AS ENUM('no_aplica', 'pendiente', 'preautorizado', 'pagado', 'fallido', 'reembolsado_parcial', 'reembolsado');--> statement-breakpoint
CREATE TYPE "public"."estado_ticket" AS ENUM('abierto', 'en_proceso', 'esperando_usuario', 'resuelto', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."estado_transferencia" AS ENUM('pendiente', 'enviada', 'confirmada', 'rechazada');--> statement-breakpoint
CREATE TYPE "public"."estado_usuario" AS ENUM('activo', 'bloqueado', 'anonimizado');--> statement-breakpoint
CREATE TYPE "public"."estado_viaje" AS ENUM('programado', 'buscando_conductor', 'asignado', 'en_sitio', 'en_curso', 'finalizado', 'cancelado', 'sin_conductor');--> statement-breakpoint
CREATE TYPE "public"."metodo_pago_viaje" AS ENUM('efectivo', 'tarjeta', 'local');--> statement-breakpoint
CREATE TYPE "public"."modalidad_ruta" AS ENUM('solo_ida', 'ida_y_vuelta');--> statement-breakpoint
CREATE TYPE "public"."prioridad_ticket" AS ENUM('baja', 'normal', 'alta', 'critica');--> statement-breakpoint
CREATE TYPE "public"."relacion_vehiculo" AS ENUM('propietario', 'autorizado');--> statement-breakpoint
CREATE TYPE "public"."resultado_cierre" AS ENUM('a_favor', 'a_cargo', 'en_cero');--> statement-breakpoint
CREATE TYPE "public"."resultado_oferta" AS ENUM('pendiente', 'aceptada', 'rechazada', 'expirada', 'retirada');--> statement-breakpoint
CREATE TYPE "public"."rol_interno" AS ENUM('monitor', 'soporte', 'cumplimiento', 'financiero', 'supervisor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."severidad_alerta" AS ENUM('critica', 'alta', 'media', 'baja');--> statement-breakpoint
CREATE TYPE "public"."tipo_alerta" AS ENUM('sos', 'parada_no_prevista', 'perdida_senal', 'desvio_ruta', 'viaje_excedido', 'velocidad_excesiva', 'reserva_sin_conductor', 'demanda_insatisfecha', 'cancelaciones_repetidas', 'documento_vencido', 'calificacion_seguridad', 'diferencia_taximetro');--> statement-breakpoint
CREATE TYPE "public"."tipo_cuenta_pago" AS ENUM('llave_bre_b', 'cuenta_bancaria');--> statement-breakpoint
CREATE TYPE "public"."tipo_documento" AS ENUM('documento_identidad', 'licencia_conduccion', 'antecedentes', 'simit', 'selfie', 'certificacion_bancaria', 'licencia_transito', 'soat', 'revision_tecnicomecanica', 'seguro_todo_riesgo', 'poliza_pasajeros', 'fotos_vehiculo', 'rut');--> statement-breakpoint
CREATE TYPE "public"."tipo_metodo_pago" AS ENUM('tarjeta', 'nequi', 'pse', 'bre_b');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento" AS ENUM('ingreso_viaje_electronico', 'comision_viaje_efectivo', 'peaje', 'propina', 'cancelacion', 'pago_comision', 'pago_liquidacion', 'ajuste');--> statement-breakpoint
CREATE TYPE "public"."tipo_pago" AS ENUM('efectivo', 'electronico');--> statement-breakpoint
CREATE TYPE "public"."tipo_recargo" AS ENUM('fijo', 'porcentaje');--> statement-breakpoint
CREATE TYPE "public"."tipo_servicio" AS ENUM('inmediato', 'programado', 'aeropuerto', 'intermunicipal');--> statement-breakpoint
CREATE TYPE "public"."tipo_ticket" AS ENUM('peticion', 'queja', 'reclamo', 'sugerencia', 'objeto_perdido', 'cobro_incorrecto', 'incidente_seguridad');--> statement-breakpoint
CREATE TYPE "public"."tipo_zona" AS ENUM('area_servicio', 'aeropuerto', 'restringida', 'punto_encuentro', 'termales', 'moteles');--> statement-breakpoint
CREATE TYPE "public"."titular_documento" AS ENUM('conductor', 'vehiculo');--> statement-breakpoint
CREATE TABLE "contacto_confianza" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"pasajero_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text NOT NULL,
	CONSTRAINT "contacto_confianza_telefono_e164" CHECK ("contacto_confianza"."telefono" ~ '^[+][1-9][0-9]{7,14}$')
);
--> statement-breakpoint
CREATE TABLE "empleado" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"contrasena_hash" text NOT NULL,
	"totp_secreto_cifrado" text,
	"totp_activo" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_ingreso_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lugar_guardado" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"pasajero_id" uuid NOT NULL,
	"etiqueta" text NOT NULL,
	"direccion" text NOT NULL,
	"ubicacion" geography(Point,4326) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metodo_pago" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"pasajero_id" uuid NOT NULL,
	"tipo" "tipo_metodo_pago" NOT NULL,
	"proveedor" text DEFAULT 'wompi' NOT NULL,
	"token_proveedor" text NOT NULL,
	"marca" text,
	"ultimos4" text,
	"predeterminado" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metodo_pago_ultimos4" CHECK ("metodo_pago"."ultimos4" is null or "metodo_pago"."ultimos4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "otp_codigo" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"telefono" text NOT NULL,
	"codigo_hash" text NOT NULL,
	"canal" text DEFAULT 'whatsapp' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"consumido_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_codigo_canal" CHECK ("otp_codigo"."canal" in ('whatsapp', 'sms')),
	CONSTRAINT "otp_codigo_intentos" CHECK ("otp_codigo"."intentos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pasajero" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"calificacion_promedio" numeric(3, 2),
	"calificaciones_total" integer DEFAULT 0 NOT NULL,
	"deuda_pendiente" bigint DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pasajero_deuda_no_negativa" CHECK ("pasajero"."deuda_pendiente" >= 0),
	CONSTRAINT "pasajero_calificacion_rango" CHECK ("pasajero"."calificacion_promedio" is null or "pasajero"."calificacion_promedio" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "sesion" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"dispositivo" text,
	"ip" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"revocada_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "suscripcion_push" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"clave_p256dh" text NOT NULL,
	"clave_auth" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"telefono" text NOT NULL,
	"email" text,
	"nombre" text NOT NULL,
	"estado" "estado_usuario" DEFAULT 'activo' NOT NULL,
	"foto_clave" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_telefono_e164" CHECK ("usuario"."telefono" ~ '^[+][1-9][0-9]{7,14}$')
);
--> statement-breakpoint
CREATE TABLE "usuario_rol" (
	"usuario_id" uuid NOT NULL,
	"rol" "rol_interno" NOT NULL,
	CONSTRAINT "usuario_rol_usuario_id_rol_pk" PRIMARY KEY("usuario_id","rol")
);
--> statement-breakpoint
CREATE TABLE "catalogo_vehiculo" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"marca" text NOT NULL,
	"linea" text NOT NULL,
	"anio_desde" integer DEFAULT 1990 NOT NULL,
	"anio_hasta" integer,
	"carroceria" text,
	"pasajeros" integer,
	"puertas" integer,
	"categoria" "categoria_vehiculo" NOT NULL,
	"foto_clave" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalogo_vehiculo_anios" CHECK ("catalogo_vehiculo"."anio_hasta" is null or "catalogo_vehiculo"."anio_hasta" >= "catalogo_vehiculo"."anio_desde")
);
--> statement-breakpoint
CREATE TABLE "ciudad" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"nombre" text NOT NULL,
	"departamento" text NOT NULL,
	"area_servicio" geography(Polygon,4326),
	"zona_horaria" text DEFAULT 'America/Bogota' NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dinamica_zona" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"zona_id" uuid NOT NULL,
	"multiplicador" numeric(4, 2) NOT NULL,
	"desde" timestamp with time zone NOT NULL,
	"hasta" timestamp with time zone NOT NULL,
	"motivo" text NOT NULL,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dinamica_zona_multiplicador" CHECK ("dinamica_zona"."multiplicador" >= 1),
	CONSTRAINT "dinamica_zona_periodo" CHECK ("dinamica_zona"."hasta" > "dinamica_zona"."desde")
);
--> statement-breakpoint
CREATE TABLE "festivo" (
	"fecha" date PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parametro" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"descripcion" text,
	"actualizado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ruta_fija" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"ciudad_origen_id" uuid NOT NULL,
	"destino" text NOT NULL,
	"modalidad" "modalidad_ruta" DEFAULT 'solo_ida' NOT NULL,
	"tarifa" bigint NOT NULL,
	"destino_ubicacion" geography(Point,4326),
	"fuente" text,
	"vigente_desde" date NOT NULL,
	"vigente_hasta" date,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ruta_fija_tarifa" CHECK ("ruta_fija"."tarifa" > 0),
	CONSTRAINT "ruta_fija_vigencia" CHECK ("ruta_fija"."vigente_hasta" is null or "ruta_fija"."vigente_hasta" > "ruta_fija"."vigente_desde")
);
--> statement-breakpoint
CREATE TABLE "tarifa" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"ciudad_id" uuid NOT NULL,
	"tipo_servicio" "tipo_servicio" DEFAULT 'inmediato' NOT NULL,
	"version" integer NOT NULL,
	"base" bigint NOT NULL,
	"valor_km" bigint NOT NULL,
	"valor_minuto" bigint NOT NULL,
	"minima" bigint NOT NULL,
	"cancelacion" bigint DEFAULT 4000 NOT NULL,
	"espera_minuto" bigint DEFAULT 250 NOT NULL,
	"espera_minutos_gratis" integer DEFAULT 3 NOT NULL,
	"fuente" text,
	"vigente_desde" timestamp with time zone NOT NULL,
	"vigente_hasta" timestamp with time zone,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tarifa_valores_no_negativos" CHECK ("tarifa"."base" >= 0 and "tarifa"."valor_km" >= 0 and "tarifa"."valor_minuto" >= 0 and "tarifa"."minima" >= 0
        and "tarifa"."cancelacion" >= 0 and "tarifa"."espera_minuto" >= 0 and "tarifa"."espera_minutos_gratis" >= 0),
	CONSTRAINT "tarifa_vigencia" CHECK ("tarifa"."vigente_hasta" is null or "tarifa"."vigente_hasta" > "tarifa"."vigente_desde")
);
--> statement-breakpoint
CREATE TABLE "tarifa_recargo" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tarifa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_recargo" DEFAULT 'fijo' NOT NULL,
	"valor" bigint NOT NULL,
	"categoria" "categoria_vehiculo",
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tarifa_recargo_valor" CHECK ("tarifa_recargo"."valor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "zona" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"ciudad_id" uuid NOT NULL,
	"tipo" "tipo_zona" NOT NULL,
	"nombre" text NOT NULL,
	"poligono" geography(Polygon,4326) NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conductor" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"ciudad_id" uuid NOT NULL,
	"estado_habilitacion" "estado_habilitacion" DEFAULT 'registro_incompleto' NOT NULL,
	"estado_operativo" "estado_operativo" DEFAULT 'desconectado' NOT NULL,
	"vehiculo_activo_id" uuid,
	"acepta_categoria_inferior" boolean DEFAULT false NOT NULL,
	"acepta_intermunicipal" boolean DEFAULT false NOT NULL,
	"bloqueado_por_deuda" boolean DEFAULT false NOT NULL,
	"rut" text,
	"calificacion_promedio" numeric(3, 2),
	"calificaciones_total" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conductor_calificacion_rango" CHECK ("conductor"."calificacion_promedio" is null or "conductor"."calificacion_promedio" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "conductor_vehiculo" (
	"conductor_id" uuid NOT NULL,
	"vehiculo_id" uuid NOT NULL,
	"relacion" "relacion_vehiculo" NOT NULL,
	CONSTRAINT "conductor_vehiculo_conductor_id_vehiculo_id_pk" PRIMARY KEY("conductor_id","vehiculo_id")
);
--> statement-breakpoint
CREATE TABLE "cuenta_pago_conductor" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"conductor_id" uuid NOT NULL,
	"tipo" "tipo_cuenta_pago" NOT NULL,
	"valor_cifrado" text NOT NULL,
	"banco" text,
	"verificada" boolean DEFAULT false NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documento" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"titular" "titular_documento" NOT NULL,
	"conductor_id" uuid,
	"vehiculo_id" uuid,
	"tipo" "tipo_documento" NOT NULL,
	"numero" text,
	"vence_en" date,
	"archivo_clave" text NOT NULL,
	"estado" "estado_documento" DEFAULT 'pendiente' NOT NULL,
	"revisado_por" uuid,
	"revisado_en" timestamp with time zone,
	"motivo_rechazo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documento_un_titular" CHECK (("documento"."titular" = 'conductor' and "documento"."conductor_id" is not null and "documento"."vehiculo_id" is null)
        or ("documento"."titular" = 'vehiculo' and "documento"."vehiculo_id" is not null and "documento"."conductor_id" is null)),
	CONSTRAINT "documento_rechazo_con_motivo" CHECK ("documento"."estado" <> 'rechazado' or "documento"."motivo_rechazo" is not null),
	CONSTRAINT "documento_aprobado_revisado" CHECK ("documento"."estado" <> 'aprobado' or ("documento"."revisado_por" is not null and "documento"."revisado_en" is not null))
);
--> statement-breakpoint
CREATE TABLE "posicion_conductor" (
	"conductor_id" uuid NOT NULL,
	"registrada_en" timestamp with time zone NOT NULL,
	"ubicacion" geography(Point,4326) NOT NULL,
	"precision_m" integer,
	"velocidad_kmh" numeric(5, 1),
	"rumbo" integer,
	"estado_operativo" "estado_operativo" NOT NULL,
	"viaje_id" uuid,
	CONSTRAINT "posicion_conductor_conductor_id_registrada_en_pk" PRIMARY KEY("conductor_id","registrada_en"),
	CONSTRAINT "posicion_rumbo" CHECK ("posicion_conductor"."rumbo" is null or "posicion_conductor"."rumbo" between 0 and 359)
) PARTITION BY RANGE ("registrada_en");
--> statement-breakpoint
CREATE TABLE "sesion_conductor" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"conductor_id" uuid NOT NULL,
	"vehiculo_id" uuid NOT NULL,
	"inicio" timestamp with time zone DEFAULT now() NOT NULL,
	"fin" timestamp with time zone,
	CONSTRAINT "sesion_conductor_periodo" CHECK ("sesion_conductor"."fin" is null or "sesion_conductor"."fin" >= "sesion_conductor"."inicio")
);
--> statement-breakpoint
CREATE TABLE "vehiculo" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"placa" text NOT NULL,
	"catalogo_vehiculo_id" uuid,
	"marca" text NOT NULL,
	"linea" text NOT NULL,
	"modelo_anio" integer NOT NULL,
	"color" text NOT NULL,
	"categoria" "categoria_vehiculo" NOT NULL,
	"fuera_de_catalogo" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehiculo_placa_formato" CHECK ("vehiculo"."placa" ~ '^[A-Z]{3}[0-9]{2}[0-9A-Z]$'),
	CONSTRAINT "vehiculo_modelo_anio" CHECK ("vehiculo"."modelo_anio" between 1950 and 2100)
);
--> statement-breakpoint
CREATE TABLE "alerta" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tipo" "tipo_alerta" NOT NULL,
	"severidad" "severidad_alerta" NOT NULL,
	"estado" "estado_alerta" DEFAULT 'abierta' NOT NULL,
	"viaje_id" uuid,
	"conductor_id" uuid,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tomada_por" uuid,
	"tomada_en" timestamp with time zone,
	"nota_cierre" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrada_en" timestamp with time zone,
	CONSTRAINT "alerta_tomada" CHECK ("alerta"."estado" = 'abierta' or ("alerta"."tomada_por" is not null and "alerta"."tomada_en" is not null)),
	CONSTRAINT "alerta_cerrada" CHECK ("alerta"."estado" <> 'cerrada' or ("alerta"."nota_cierre" is not null and "alerta"."cerrada_en" is not null))
);
--> statement-breakpoint
CREATE TABLE "calificacion" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"viaje_id" uuid NOT NULL,
	"de_usuario_id" uuid NOT NULL,
	"a_usuario_id" uuid NOT NULL,
	"estrellas" integer NOT NULL,
	"etiquetas" text[] DEFAULT '{}'::text[] NOT NULL,
	"comentario" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calificacion_estrellas" CHECK ("calificacion"."estrellas" between 1 and 5),
	CONSTRAINT "calificacion_distintos" CHECK ("calificacion"."de_usuario_id" <> "calificacion"."a_usuario_id")
);
--> statement-breakpoint
CREATE TABLE "cotizacion" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"pasajero_id" uuid NOT NULL,
	"ciudad_id" uuid NOT NULL,
	"categoria" "categoria_vehiculo" NOT NULL,
	"tipo_servicio" "tipo_servicio" NOT NULL,
	"origen" geography(Point,4326) NOT NULL,
	"origen_direccion" text,
	"destino" geography(Point,4326) NOT NULL,
	"destino_direccion" text,
	"tarifa_id" uuid,
	"ruta_fija_id" uuid,
	"multiplicador_dinamico" numeric(4, 2) DEFAULT 1 NOT NULL,
	"distancia_estimada_m" integer,
	"duracion_estimada_s" integer,
	"tiempo_detenido_estimado_s" integer,
	"precio_min" bigint NOT NULL,
	"precio_max" bigint NOT NULL,
	"desglose" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cotizacion_una_tarifa" CHECK (("cotizacion"."tarifa_id" is not null and "cotizacion"."ruta_fija_id" is null)
        or ("cotizacion"."tarifa_id" is null and "cotizacion"."ruta_fija_id" is not null)),
	CONSTRAINT "cotizacion_rango" CHECK ("cotizacion"."precio_min" >= 0 and "cotizacion"."precio_max" >= "cotizacion"."precio_min"),
	CONSTRAINT "cotizacion_dinamica" CHECK ("cotizacion"."multiplicador_dinamico" >= 1)
);
--> statement-breakpoint
CREATE TABLE "oferta" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"viaje_id" uuid NOT NULL,
	"conductor_id" uuid NOT NULL,
	"ronda" integer DEFAULT 1 NOT NULL,
	"eta_recogida_s" integer,
	"distancia_recogida_m" integer,
	"ofrecida_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"respondida_en" timestamp with time zone,
	"resultado" "resultado_oferta" DEFAULT 'pendiente' NOT NULL,
	CONSTRAINT "oferta_expiracion" CHECK ("oferta"."expira_en" > "oferta"."ofrecida_en"),
	CONSTRAINT "oferta_respuesta" CHECK (("oferta"."resultado" = 'pendiente' and "oferta"."respondida_en" is null)
        or ("oferta"."resultado" <> 'pendiente' and "oferta"."respondida_en" is not null))
);
--> statement-breakpoint
CREATE TABLE "viaje" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"codigo" text DEFAULT generar_codigo_viaje() NOT NULL,
	"pasajero_id" uuid NOT NULL,
	"conductor_id" uuid,
	"vehiculo_id" uuid,
	"tipo_servicio" "tipo_servicio" NOT NULL,
	"categoria" "categoria_vehiculo" NOT NULL,
	"estado" "estado_viaje" DEFAULT 'buscando_conductor' NOT NULL,
	"estado_pago" "estado_pago" DEFAULT 'pendiente' NOT NULL,
	"origen" geography(Point,4326) NOT NULL,
	"origen_direccion" text,
	"destino" geography(Point,4326) NOT NULL,
	"destino_direccion" text,
	"nota_conductor" text,
	"programado_para" timestamp with time zone,
	"cotizacion_id" uuid NOT NULL,
	"tarifa_id" uuid,
	"ruta_fija_id" uuid,
	"multiplicador_dinamico" numeric(4, 2) DEFAULT 1 NOT NULL,
	"metodo_pago" "metodo_pago_viaje" NOT NULL,
	"metodo_pago_id" uuid,
	"pin_inicio" text,
	"precio_estimado_min" bigint NOT NULL,
	"precio_estimado_max" bigint NOT NULL,
	"distancia_taximetro_m" integer,
	"tiempo_detenido_taximetro_s" integer,
	"duracion_taximetro_s" integer,
	"distancia_real_m" integer,
	"tiempo_detenido_s" integer,
	"duracion_s" integer,
	"desglose" jsonb,
	"total_carrera" bigint,
	"cobro_espera" bigint DEFAULT 0 NOT NULL,
	"peajes" bigint DEFAULT 0 NOT NULL,
	"propina" bigint DEFAULT 0 NOT NULL,
	"precio_final" bigint,
	"comision" bigint,
	"comision_pb" integer,
	"trayectoria" geography(LineString,4326),
	"solicitado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"aceptado_en" timestamp with time zone,
	"en_sitio_en" timestamp with time zone,
	"iniciado_en" timestamp with time zone,
	"finalizado_en" timestamp with time zone,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" "actor_tipo",
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "viaje_codigo_formato" CHECK ("viaje"."codigo" ~ '^TY-[0-9A-Z]{6}$'),
	CONSTRAINT "viaje_pin_formato" CHECK ("viaje"."pin_inicio" is null or "viaje"."pin_inicio" ~ '^[0-9]{4}$'),
	CONSTRAINT "viaje_conductor_asignado" CHECK ("viaje"."estado" not in ('asignado', 'en_sitio', 'en_curso', 'finalizado')
        or ("viaje"."conductor_id" is not null and "viaje"."vehiculo_id" is not null)),
	CONSTRAINT "viaje_finalizado_completo" CHECK ("viaje"."estado" <> 'finalizado'
        or ("viaje"."finalizado_en" is not null and "viaje"."iniciado_en" is not null and "viaje"."precio_final" is not null
          and "viaje"."total_carrera" is not null and "viaje"."comision" is not null and "viaje"."comision_pb" is not null)),
	CONSTRAINT "viaje_cancelado_completo" CHECK ("viaje"."estado" <> 'cancelado' or ("viaje"."cancelado_en" is not null and "viaje"."cancelado_por" is not null)),
	CONSTRAINT "viaje_montos" CHECK ("viaje"."precio_estimado_min" >= 0 and "viaje"."precio_estimado_max" >= "viaje"."precio_estimado_min"
        and "viaje"."cobro_espera" >= 0 and "viaje"."peajes" >= 0 and "viaje"."propina" >= 0
        and ("viaje"."total_carrera" is null or "viaje"."total_carrera" >= 0)
        and ("viaje"."precio_final" is null or "viaje"."precio_final" >= 0)
        and ("viaje"."comision" is null or ("viaje"."comision" >= 0 and "viaje"."comision" <= "viaje"."precio_final"))
        and ("viaje"."comision_pb" is null or "viaje"."comision_pb" between 0 and 10000)),
	CONSTRAINT "viaje_mediciones" CHECK (coalesce("viaje"."distancia_taximetro_m", 0) >= 0 and coalesce("viaje"."tiempo_detenido_taximetro_s", 0) >= 0
        and coalesce("viaje"."duracion_taximetro_s", 0) >= 0 and coalesce("viaje"."distancia_real_m", 0) >= 0
        and coalesce("viaje"."tiempo_detenido_s", 0) >= 0 and coalesce("viaje"."duracion_s", 0) >= 0
        and coalesce("viaje"."tiempo_detenido_s", 0) <= coalesce("viaje"."duracion_s", "viaje"."tiempo_detenido_s", 0)),
	CONSTRAINT "viaje_orden_tiempos" CHECK (("viaje"."aceptado_en" is null or "viaje"."aceptado_en" >= "viaje"."solicitado_en")
        and ("viaje"."en_sitio_en" is null or "viaje"."aceptado_en" is null or "viaje"."en_sitio_en" >= "viaje"."aceptado_en")
        and ("viaje"."iniciado_en" is null or "viaje"."en_sitio_en" is null or "viaje"."iniciado_en" >= "viaje"."en_sitio_en")
        and ("viaje"."finalizado_en" is null or "viaje"."iniciado_en" is null or "viaje"."finalizado_en" >= "viaje"."iniciado_en"))
);
--> statement-breakpoint
CREATE TABLE "viaje_compartido" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"viaje_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viaje_evento" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"viaje_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"actor_tipo" "actor_tipo" NOT NULL,
	"actor_id" uuid,
	"ubicacion" geography(Point,4326),
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "viaje_evento_tipo" CHECK ("viaje_evento"."tipo" ~ '^[a-z][a-z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "viaje_mensaje" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"viaje_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"cuerpo" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "viaje_mensaje_largo" CHECK (char_length("viaje_mensaje"."cuerpo") between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"usuario_id" uuid,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid,
	"antes" jsonb,
	"despues" jsonb,
	"motivo" text,
	"ip" text,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auditoria_accion" CHECK ("auditoria"."accion" ~ '^[a-z_]+([.][a-z_]+)+$')
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"tipo" "tipo_ticket" NOT NULL,
	"estado" "estado_ticket" DEFAULT 'abierto' NOT NULL,
	"prioridad" "prioridad_ticket" DEFAULT 'normal' NOT NULL,
	"usuario_id" uuid NOT NULL,
	"viaje_id" uuid,
	"asignado_a" uuid,
	"asunto" text NOT NULL,
	"vence_sla_en" timestamp with time zone,
	"resuelto_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_resuelto" CHECK ("ticket"."estado" not in ('resuelto', 'cerrado') or "ticket"."resuelto_en" is not null)
);
--> statement-breakpoint
CREATE TABLE "ticket_mensaje" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"cuerpo" text NOT NULL,
	"interno" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cierre_diario" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"conductor_id" uuid NOT NULL,
	"dia" date NOT NULL,
	"saldo_inicial" bigint NOT NULL,
	"neto_dia" bigint NOT NULL,
	"saldo_final" bigint NOT NULL,
	"resultado" "resultado_cierre" NOT NULL,
	"estado" "estado_cierre" DEFAULT 'abierto' NOT NULL,
	"generado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"aprobado_por" uuid,
	"aprobado_en" timestamp with time zone,
	CONSTRAINT "cierre_diario_cuadra" CHECK ("cierre_diario"."saldo_final" = "cierre_diario"."saldo_inicial" + "cierre_diario"."neto_dia"),
	CONSTRAINT "cierre_diario_resultado" CHECK (("cierre_diario"."resultado" = 'a_favor' and "cierre_diario"."saldo_final" > 0)
        or ("cierre_diario"."resultado" = 'a_cargo' and "cierre_diario"."saldo_final" < 0)
        or ("cierre_diario"."resultado" = 'en_cero' and "cierre_diario"."saldo_final" = 0))
);
--> statement-breakpoint
CREATE TABLE "movimiento_saldo" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"conductor_id" uuid NOT NULL,
	"tipo" "tipo_movimiento" NOT NULL,
	"monto" bigint NOT NULL,
	"viaje_id" uuid,
	"cierre_id" uuid,
	"pago_comision_id" uuid,
	"pago_conductor_id" uuid,
	"motivo" text,
	"creado_por" uuid,
	"aprobado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"dia" date GENERATED ALWAYS AS (((creado_en at time zone 'America/Bogota')::date)) STORED,
	CONSTRAINT "movimiento_monto_no_cero" CHECK ("movimiento_saldo"."monto" <> 0),
	CONSTRAINT "movimiento_signo_y_origen" CHECK (case "movimiento_saldo"."tipo"
        when 'ingreso_viaje_electronico' then "movimiento_saldo"."monto" > 0 and "movimiento_saldo"."viaje_id" is not null
        when 'comision_viaje_efectivo' then "movimiento_saldo"."monto" < 0 and "movimiento_saldo"."viaje_id" is not null
        when 'peaje' then "movimiento_saldo"."monto" > 0 and "movimiento_saldo"."viaje_id" is not null
        when 'propina' then "movimiento_saldo"."monto" > 0 and "movimiento_saldo"."viaje_id" is not null
        when 'cancelacion' then "movimiento_saldo"."viaje_id" is not null
        when 'pago_comision' then "movimiento_saldo"."monto" > 0 and "movimiento_saldo"."pago_comision_id" is not null
        when 'pago_liquidacion' then "movimiento_saldo"."monto" < 0 and "movimiento_saldo"."pago_conductor_id" is not null
        when 'ajuste' then "movimiento_saldo"."motivo" is not null and "movimiento_saldo"."creado_por" is not null
          and "movimiento_saldo"."aprobado_por" is not null and "movimiento_saldo"."aprobado_por" <> "movimiento_saldo"."creado_por"
        else false end)
);
--> statement-breakpoint
CREATE TABLE "pago" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"viaje_id" uuid NOT NULL,
	"metodo_pago_id" uuid,
	"tipo" "tipo_pago" NOT NULL,
	"monto" bigint NOT NULL,
	"estado" "estado_pago" DEFAULT 'pendiente' NOT NULL,
	"referencia_proveedor" text,
	"clave_idempotencia" text NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pago_monto" CHECK ("pago"."monto" > 0),
	CONSTRAINT "pago_intentos" CHECK ("pago"."intentos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pago_comision" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"conductor_id" uuid NOT NULL,
	"cierre_id" uuid,
	"monto" bigint NOT NULL,
	"canal" text DEFAULT 'llave_bre_b' NOT NULL,
	"referencia" text,
	"estado" "estado_conciliacion" DEFAULT 'pendiente' NOT NULL,
	"conciliado_por" uuid,
	"conciliado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pago_comision_monto" CHECK ("pago_comision"."monto" > 0),
	CONSTRAINT "pago_comision_conciliado" CHECK ("pago_comision"."estado" <> 'conciliado' or "pago_comision"."conciliado_en" is not null)
);
--> statement-breakpoint
CREATE TABLE "pago_conductor" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"conductor_id" uuid NOT NULL,
	"cierre_id" uuid NOT NULL,
	"cuenta_pago_id" uuid NOT NULL,
	"monto" bigint NOT NULL,
	"estado" "estado_transferencia" DEFAULT 'pendiente' NOT NULL,
	"referencia" text,
	"motivo_rechazo" text,
	"enviado_en" timestamp with time zone,
	"confirmado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pago_conductor_monto" CHECK ("pago_conductor"."monto" > 0),
	CONSTRAINT "pago_conductor_confirmado" CHECK ("pago_conductor"."estado" <> 'confirmada' or "pago_conductor"."confirmado_en" is not null)
);
--> statement-breakpoint
CREATE TABLE "reembolso" (
	"id" uuid PRIMARY KEY DEFAULT uuid_v7() NOT NULL,
	"pago_id" uuid NOT NULL,
	"ticket_id" uuid,
	"monto" bigint NOT NULL,
	"motivo" text NOT NULL,
	"aprobado_por" uuid NOT NULL,
	"referencia_proveedor" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reembolso_monto" CHECK ("reembolso"."monto" > 0)
);
--> statement-breakpoint
ALTER TABLE "contacto_confianza" ADD CONSTRAINT "contacto_confianza_pasajero_id_pasajero_usuario_id_fk" FOREIGN KEY ("pasajero_id") REFERENCES "public"."pasajero"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lugar_guardado" ADD CONSTRAINT "lugar_guardado_pasajero_id_pasajero_usuario_id_fk" FOREIGN KEY ("pasajero_id") REFERENCES "public"."pasajero"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metodo_pago" ADD CONSTRAINT "metodo_pago_pasajero_id_pasajero_usuario_id_fk" FOREIGN KEY ("pasajero_id") REFERENCES "public"."pasajero"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pasajero" ADD CONSTRAINT "pasajero_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripcion_push" ADD CONSTRAINT "suscripcion_push_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_usuario_id_empleado_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."empleado"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dinamica_zona" ADD CONSTRAINT "dinamica_zona_zona_id_zona_id_fk" FOREIGN KEY ("zona_id") REFERENCES "public"."zona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dinamica_zona" ADD CONSTRAINT "dinamica_zona_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametro" ADD CONSTRAINT "parametro_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruta_fija" ADD CONSTRAINT "ruta_fija_ciudad_origen_id_ciudad_id_fk" FOREIGN KEY ("ciudad_origen_id") REFERENCES "public"."ciudad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifa" ADD CONSTRAINT "tarifa_ciudad_id_ciudad_id_fk" FOREIGN KEY ("ciudad_id") REFERENCES "public"."ciudad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifa" ADD CONSTRAINT "tarifa_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifa_recargo" ADD CONSTRAINT "tarifa_recargo_tarifa_id_tarifa_id_fk" FOREIGN KEY ("tarifa_id") REFERENCES "public"."tarifa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zona" ADD CONSTRAINT "zona_ciudad_id_ciudad_id_fk" FOREIGN KEY ("ciudad_id") REFERENCES "public"."ciudad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conductor" ADD CONSTRAINT "conductor_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conductor" ADD CONSTRAINT "conductor_ciudad_id_ciudad_id_fk" FOREIGN KEY ("ciudad_id") REFERENCES "public"."ciudad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conductor" ADD CONSTRAINT "conductor_vehiculo_activo_id_vehiculo_id_fk" FOREIGN KEY ("vehiculo_activo_id") REFERENCES "public"."vehiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conductor_vehiculo" ADD CONSTRAINT "conductor_vehiculo_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conductor_vehiculo" ADD CONSTRAINT "conductor_vehiculo_vehiculo_id_vehiculo_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuenta_pago_conductor" ADD CONSTRAINT "cuenta_pago_conductor_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_vehiculo_id_vehiculo_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_revisado_por_usuario_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_conductor" ADD CONSTRAINT "sesion_conductor_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_conductor" ADD CONSTRAINT "sesion_conductor_vehiculo_id_vehiculo_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehiculo" ADD CONSTRAINT "vehiculo_catalogo_vehiculo_id_catalogo_vehiculo_id_fk" FOREIGN KEY ("catalogo_vehiculo_id") REFERENCES "public"."catalogo_vehiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_tomada_por_usuario_id_fk" FOREIGN KEY ("tomada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calificacion" ADD CONSTRAINT "calificacion_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calificacion" ADD CONSTRAINT "calificacion_de_usuario_id_usuario_id_fk" FOREIGN KEY ("de_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calificacion" ADD CONSTRAINT "calificacion_a_usuario_id_usuario_id_fk" FOREIGN KEY ("a_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_pasajero_id_pasajero_usuario_id_fk" FOREIGN KEY ("pasajero_id") REFERENCES "public"."pasajero"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_ciudad_id_ciudad_id_fk" FOREIGN KEY ("ciudad_id") REFERENCES "public"."ciudad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_tarifa_id_tarifa_id_fk" FOREIGN KEY ("tarifa_id") REFERENCES "public"."tarifa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_ruta_fija_id_ruta_fija_id_fk" FOREIGN KEY ("ruta_fija_id") REFERENCES "public"."ruta_fija"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oferta" ADD CONSTRAINT "oferta_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oferta" ADD CONSTRAINT "oferta_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_pasajero_id_pasajero_usuario_id_fk" FOREIGN KEY ("pasajero_id") REFERENCES "public"."pasajero"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_vehiculo_id_vehiculo_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_cotizacion_id_cotizacion_id_fk" FOREIGN KEY ("cotizacion_id") REFERENCES "public"."cotizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_tarifa_id_tarifa_id_fk" FOREIGN KEY ("tarifa_id") REFERENCES "public"."tarifa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_ruta_fija_id_ruta_fija_id_fk" FOREIGN KEY ("ruta_fija_id") REFERENCES "public"."ruta_fija"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_metodo_pago_id_metodo_pago_id_fk" FOREIGN KEY ("metodo_pago_id") REFERENCES "public"."metodo_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje_compartido" ADD CONSTRAINT "viaje_compartido_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje_evento" ADD CONSTRAINT "viaje_evento_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje_mensaje" ADD CONSTRAINT "viaje_mensaje_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje_mensaje" ADD CONSTRAINT "viaje_mensaje_autor_id_usuario_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_asignado_a_usuario_id_fk" FOREIGN KEY ("asignado_a") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_mensaje" ADD CONSTRAINT "ticket_mensaje_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_mensaje" ADD CONSTRAINT "ticket_mensaje_autor_id_usuario_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cierre_diario" ADD CONSTRAINT "cierre_diario_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cierre_diario" ADD CONSTRAINT "cierre_diario_aprobado_por_usuario_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_saldo" ADD CONSTRAINT "movimiento_saldo_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_saldo" ADD CONSTRAINT "movimiento_saldo_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_saldo" ADD CONSTRAINT "movimiento_saldo_cierre_id_cierre_diario_id_fk" FOREIGN KEY ("cierre_id") REFERENCES "public"."cierre_diario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_saldo" ADD CONSTRAINT "movimiento_saldo_pago_comision_id_pago_comision_id_fk" FOREIGN KEY ("pago_comision_id") REFERENCES "public"."pago_comision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_saldo" ADD CONSTRAINT "movimiento_saldo_pago_conductor_id_pago_conductor_id_fk" FOREIGN KEY ("pago_conductor_id") REFERENCES "public"."pago_conductor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_saldo" ADD CONSTRAINT "movimiento_saldo_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_saldo" ADD CONSTRAINT "movimiento_saldo_aprobado_por_usuario_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago" ADD CONSTRAINT "pago_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago" ADD CONSTRAINT "pago_metodo_pago_id_metodo_pago_id_fk" FOREIGN KEY ("metodo_pago_id") REFERENCES "public"."metodo_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_comision" ADD CONSTRAINT "pago_comision_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_comision" ADD CONSTRAINT "pago_comision_cierre_id_cierre_diario_id_fk" FOREIGN KEY ("cierre_id") REFERENCES "public"."cierre_diario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_comision" ADD CONSTRAINT "pago_comision_conciliado_por_usuario_id_fk" FOREIGN KEY ("conciliado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_conductor" ADD CONSTRAINT "pago_conductor_conductor_id_conductor_usuario_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."conductor"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_conductor" ADD CONSTRAINT "pago_conductor_cierre_id_cierre_diario_id_fk" FOREIGN KEY ("cierre_id") REFERENCES "public"."cierre_diario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_conductor" ADD CONSTRAINT "pago_conductor_cuenta_pago_id_cuenta_pago_conductor_id_fk" FOREIGN KEY ("cuenta_pago_id") REFERENCES "public"."cuenta_pago_conductor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reembolso" ADD CONSTRAINT "reembolso_pago_id_pago_id_fk" FOREIGN KEY ("pago_id") REFERENCES "public"."pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reembolso" ADD CONSTRAINT "reembolso_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reembolso" ADD CONSTRAINT "reembolso_aprobado_por_usuario_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacto_confianza_pasajero_idx" ON "contacto_confianza" USING btree ("pasajero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "empleado_email_uq" ON "empleado" USING btree ("email");--> statement-breakpoint
CREATE INDEX "lugar_guardado_pasajero_idx" ON "lugar_guardado" USING btree ("pasajero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metodo_pago_token_uq" ON "metodo_pago" USING btree ("proveedor","token_proveedor");--> statement-breakpoint
CREATE UNIQUE INDEX "metodo_pago_predeterminado_uq" ON "metodo_pago" USING btree ("pasajero_id") WHERE "metodo_pago"."predeterminado" and "metodo_pago"."activo";--> statement-breakpoint
CREATE INDEX "otp_codigo_telefono_idx" ON "otp_codigo" USING btree ("telefono","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "sesion_token_hash_uq" ON "sesion" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sesion_usuario_idx" ON "sesion" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suscripcion_push_endpoint_uq" ON "suscripcion_push" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_telefono_uq" ON "usuario" USING btree ("telefono");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogo_vehiculo_uq" ON "catalogo_vehiculo" USING btree ("marca","linea","anio_desde");--> statement-breakpoint
CREATE UNIQUE INDEX "ciudad_nombre_uq" ON "ciudad" USING btree ("nombre","departamento");--> statement-breakpoint
CREATE INDEX "dinamica_zona_vigencia_idx" ON "dinamica_zona" USING btree ("zona_id","desde","hasta");--> statement-breakpoint
CREATE UNIQUE INDEX "ruta_fija_uq" ON "ruta_fija" USING btree ("ciudad_origen_id","destino","modalidad","vigente_desde");--> statement-breakpoint
CREATE UNIQUE INDEX "tarifa_version_uq" ON "tarifa" USING btree ("ciudad_id","tipo_servicio","version");--> statement-breakpoint
CREATE UNIQUE INDEX "tarifa_recargo_general_uq" ON "tarifa_recargo" USING btree ("tarifa_id","codigo") WHERE "tarifa_recargo"."categoria" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tarifa_recargo_categoria_uq" ON "tarifa_recargo" USING btree ("tarifa_id","codigo","categoria") WHERE "tarifa_recargo"."categoria" is not null;--> statement-breakpoint
CREATE INDEX "zona_ciudad_tipo_idx" ON "zona" USING btree ("ciudad_id","tipo");--> statement-breakpoint
CREATE INDEX "conductor_ciudad_estado_idx" ON "conductor" USING btree ("ciudad_id","estado_operativo");--> statement-breakpoint
CREATE UNIQUE INDEX "cuenta_pago_activa_uq" ON "cuenta_pago_conductor" USING btree ("conductor_id") WHERE "cuenta_pago_conductor"."activa";--> statement-breakpoint
CREATE INDEX "documento_conductor_tipo_idx" ON "documento" USING btree ("conductor_id","tipo");--> statement-breakpoint
CREATE INDEX "documento_vehiculo_tipo_idx" ON "documento" USING btree ("vehiculo_id","tipo");--> statement-breakpoint
CREATE INDEX "documento_vencimiento_idx" ON "documento" USING btree ("vence_en") WHERE "documento"."estado" = 'aprobado';--> statement-breakpoint
CREATE INDEX "posicion_viaje_idx" ON "posicion_conductor" USING btree ("viaje_id","registrada_en") WHERE "posicion_conductor"."viaje_id" is not null;--> statement-breakpoint
CREATE INDEX "sesion_conductor_idx" ON "sesion_conductor" USING btree ("conductor_id","inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "sesion_conductor_abierta_uq" ON "sesion_conductor" USING btree ("conductor_id") WHERE "sesion_conductor"."fin" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "vehiculo_placa_uq" ON "vehiculo" USING btree ("placa");--> statement-breakpoint
CREATE INDEX "alerta_abiertas_idx" ON "alerta" USING btree ("severidad","creado_en") WHERE "alerta"."estado" <> 'cerrada';--> statement-breakpoint
CREATE INDEX "alerta_viaje_idx" ON "alerta" USING btree ("viaje_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calificacion_una_por_autor_uq" ON "calificacion" USING btree ("viaje_id","de_usuario_id");--> statement-breakpoint
CREATE INDEX "calificacion_destinatario_idx" ON "calificacion" USING btree ("a_usuario_id","creado_en");--> statement-breakpoint
CREATE INDEX "cotizacion_pasajero_idx" ON "cotizacion" USING btree ("pasajero_id","creado_en");--> statement-breakpoint
CREATE INDEX "oferta_viaje_idx" ON "oferta" USING btree ("viaje_id","ofrecida_en");--> statement-breakpoint
CREATE UNIQUE INDEX "oferta_viaje_conductor_ronda_uq" ON "oferta" USING btree ("viaje_id","conductor_id","ronda");--> statement-breakpoint
CREATE UNIQUE INDEX "oferta_una_pendiente_por_conductor_uq" ON "oferta" USING btree ("conductor_id") WHERE "oferta"."resultado" = 'pendiente';--> statement-breakpoint
CREATE UNIQUE INDEX "oferta_una_aceptada_por_viaje_uq" ON "oferta" USING btree ("viaje_id") WHERE "oferta"."resultado" = 'aceptada';--> statement-breakpoint
CREATE UNIQUE INDEX "viaje_codigo_uq" ON "viaje" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "viaje_activo_idx" ON "viaje" USING btree ("estado","solicitado_en") WHERE "viaje"."estado" in ('programado', 'buscando_conductor', 'asignado', 'en_sitio', 'en_curso');--> statement-breakpoint
CREATE INDEX "viaje_conductor_idx" ON "viaje" USING btree ("conductor_id","solicitado_en");--> statement-breakpoint
CREATE INDEX "viaje_pasajero_idx" ON "viaje" USING btree ("pasajero_id","solicitado_en");--> statement-breakpoint
CREATE INDEX "viaje_origen_gix" ON "viaje" USING gist ("origen");--> statement-breakpoint
CREATE UNIQUE INDEX "viaje_un_activo_por_conductor_uq" ON "viaje" USING btree ("conductor_id") WHERE "viaje"."estado" in ('asignado', 'en_sitio', 'en_curso');--> statement-breakpoint
CREATE UNIQUE INDEX "viaje_compartido_token_uq" ON "viaje_compartido" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "viaje_evento_idx" ON "viaje_evento" USING btree ("viaje_id","ocurrido_en");--> statement-breakpoint
CREATE INDEX "viaje_mensaje_idx" ON "viaje_mensaje" USING btree ("viaje_id","creado_en");--> statement-breakpoint
CREATE INDEX "auditoria_entidad_idx" ON "auditoria" USING btree ("entidad","entidad_id","ocurrido_en");--> statement-breakpoint
CREATE INDEX "auditoria_usuario_idx" ON "auditoria" USING btree ("usuario_id","ocurrido_en");--> statement-breakpoint
CREATE INDEX "ticket_bandeja_idx" ON "ticket" USING btree ("estado","prioridad","vence_sla_en") WHERE "ticket"."estado" not in ('resuelto', 'cerrado');--> statement-breakpoint
CREATE INDEX "ticket_usuario_idx" ON "ticket" USING btree ("usuario_id","creado_en");--> statement-breakpoint
CREATE INDEX "ticket_viaje_idx" ON "ticket" USING btree ("viaje_id");--> statement-breakpoint
CREATE INDEX "ticket_mensaje_idx" ON "ticket_mensaje" USING btree ("ticket_id","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "cierre_diario_conductor_dia_uq" ON "cierre_diario" USING btree ("conductor_id","dia");--> statement-breakpoint
CREATE INDEX "cierre_diario_dia_idx" ON "cierre_diario" USING btree ("dia","estado");--> statement-breakpoint
CREATE INDEX "movimiento_conductor_dia_idx" ON "movimiento_saldo" USING btree ("conductor_id","dia");--> statement-breakpoint
CREATE INDEX "movimiento_cierre_idx" ON "movimiento_saldo" USING btree ("cierre_id");--> statement-breakpoint
CREATE INDEX "movimiento_viaje_idx" ON "movimiento_saldo" USING btree ("viaje_id");--> statement-breakpoint
CREATE UNIQUE INDEX "movimiento_viaje_tipo_uq" ON "movimiento_saldo" USING btree ("viaje_id","tipo") WHERE "movimiento_saldo"."tipo" in ('ingreso_viaje_electronico', 'comision_viaje_efectivo', 'peaje', 'propina', 'cancelacion');--> statement-breakpoint
CREATE UNIQUE INDEX "movimiento_pago_comision_uq" ON "movimiento_saldo" USING btree ("pago_comision_id") WHERE "movimiento_saldo"."pago_comision_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "movimiento_pago_conductor_uq" ON "movimiento_saldo" USING btree ("pago_conductor_id") WHERE "movimiento_saldo"."pago_conductor_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "pago_idempotencia_uq" ON "pago" USING btree ("clave_idempotencia");--> statement-breakpoint
CREATE INDEX "pago_viaje_idx" ON "pago" USING btree ("viaje_id");--> statement-breakpoint
CREATE INDEX "pago_pendientes_idx" ON "pago" USING btree ("estado","actualizado_en") WHERE "pago"."estado" in ('pendiente', 'fallido');--> statement-breakpoint
CREATE UNIQUE INDEX "pago_comision_referencia_uq" ON "pago_comision" USING btree ("canal","referencia") WHERE "pago_comision"."referencia" is not null;--> statement-breakpoint
CREATE INDEX "pago_comision_pendientes_idx" ON "pago_comision" USING btree ("estado","creado_en") WHERE "pago_comision"."estado" = 'pendiente';--> statement-breakpoint
CREATE UNIQUE INDEX "pago_conductor_cierre_uq" ON "pago_conductor" USING btree ("cierre_id");--> statement-breakpoint
CREATE INDEX "pago_conductor_estado_idx" ON "pago_conductor" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "reembolso_pago_idx" ON "reembolso" USING btree ("pago_id");