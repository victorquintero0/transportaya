import { CATEGORIAS_VEHICULO, DESCUENTO_MAXIMO_PB, TIPOS_SERVICIO } from '@transportaya/dominio';
import { z } from 'zod';
import { normalizarTelefono } from '../comun/telefono.js';

export const motivo = z.string().trim().min(5).max(500);

const dinero = z.number().int().min(1).max(10_000_000_000);

export const contrato = z.object({
  nombre: z.string().trim().min(2).max(160).optional(),
  contactoNombre: z.string().trim().min(2).max(160).optional(),
  contactoTelefono: z.string().trim().max(25).nullable().optional(),
  contactoEmail: z.string().trim().email().max(200).nullable().optional(),
  /** 500 = 5 %. */
  descuentoPb: z.number().int().min(0).max(DESCUENTO_MAXIMO_PB).optional(),
  aplicaDinamica: z.boolean().optional(),
  cupo: dinero.nullable().optional(),
  diaCorte: z.number().int().min(1).max(28).optional(),
  diasPago: z.number().int().min(0).max(90).optional(),
});

export const nuevaEmpresa = contrato.extend({
  nombre: z.string().trim().min(2).max(160),
  nit: z
    .string()
    .trim()
    .regex(/^[0-9][0-9.-]{5,18}$/, 'El NIT no es válido.'),
  contactoNombre: z.string().trim().min(2).max(160),
});

export const cambioContrato = contrato.extend({ motivo });

export const soloMotivo = z.object({ motivo });

export const nuevoAdministrador = z.object({
  nombre: z.string().trim().min(3).max(120),
  telefono: z.string().min(7).max(25).transform(normalizarTelefono),
  email: z.string().trim().email().max(200),
});

export const centro = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{2,20}$/, 'El código lleva de 2 a 20 letras, números o guiones.'),
  nombre: z.string().trim().min(2).max(120),
});

export const cambioCentro = z.object({
  nombre: z.string().trim().min(2).max(120).optional(),
  activo: z.boolean().optional(),
});

export const politica = z.object({
  nombre: z.string().trim().min(2).max(80),
  /** 1 = lunes … 7 = domingo; vacío = todos. */
  dias: z.array(z.number().int().min(1).max(7)).max(7),
  desdeMin: z.number().int().min(0).max(1439),
  hastaMin: z.number().int().min(1).max(1440),
  montoMaximo: dinero.nullable(),
  categorias: z.array(z.enum(CATEGORIAS_VEHICULO)).max(3),
  tiposServicio: z.array(z.enum(TIPOS_SERVICIO)).max(4),
  motivoObligatorio: z.boolean(),
});

export const cambioPolitica = politica.extend({ activa: z.boolean().optional() });

export const invitacion = z.object({
  nombre: z.string().trim().min(2).max(120),
  telefono: z.string().min(7).max(25).transform(normalizarTelefono),
  centroCostoId: z.string().uuid().optional(),
  politicaId: z.string().uuid().optional(),
});

export const cambioEmpleado = z.object({
  centroCostoId: z.string().uuid().optional(),
  politicaId: z.string().uuid().optional(),
});

export const filtroViajes = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  centroCostoId: z.string().uuid().optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
  desplazar: z.coerce.number().int().min(0).default(0),
});

export const generar = z.object({
  /** Último día que entra (AAAA-MM-DD). Sin él, ayer. */
  hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  motivo,
});

export const pago = z.object({
  referencia: z.string().trim().min(3).max(120),
  motivo,
});
