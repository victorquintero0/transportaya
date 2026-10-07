import { catalogoVehiculo, conductor, conductorVehiculo, vehiculo } from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../comun/errores.js';

export interface DatosVehiculo {
  placa: string;
  color: string;
  modeloAnio: number;
  /** Línea del catálogo: asigna la categoría automáticamente (D-07). */
  catalogoVehiculoId?: string | undefined;
  /** Si no está en el catálogo: pasa a revisión manual de cumplimiento. */
  marca?: string | undefined;
  linea?: string | undefined;
}

export const normalizarPlaca = (placa: string) => placa.replace(/[\s-]/g, '').toUpperCase();

@Injectable()
export class VehiculosService {
  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {}

  async registrar(
    conductorId: string,
    datos: DatosVehiculo,
  ): Promise<{ id: string; categoria: string; fueraDeCatalogo: boolean }> {
    const placa = normalizarPlaca(datos.placa);
    if (!/^[A-Z]{3}[0-9]{2}[0-9A-Z]$/.test(placa)) {
      throw solicitudInvalida('La placa no es válida. Debe verse así: ABC123');
    }

    return this.bd.db.transaction(async (tx) => {
      let marca = datos.marca?.trim();
      let linea = datos.linea?.trim();
      let categoria: 'media' | 'media_alta' | 'alta' = 'media';
      let catalogoId: string | null = null;
      let fuera = true;

      if (datos.catalogoVehiculoId) {
        const [fila] = await tx
          .select()
          .from(catalogoVehiculo)
          .where(eq(catalogoVehiculo.id, datos.catalogoVehiculoId));
        if (!fila || !fila.activo)
          throw noEncontrado('VEHICULO_NO_EN_CATALOGO', 'Ese vehículo no está en el catálogo');
        if (
          datos.modeloAnio < fila.anioDesde ||
          (fila.anioHasta !== null && datos.modeloAnio > fila.anioHasta)
        ) {
          throw solicitudInvalida(
            `El ${fila.marca} ${fila.linea} no existe en el modelo ${datos.modeloAnio}.`,
          );
        }
        marca = fila.marca;
        linea = fila.linea;
        categoria = fila.categoria;
        catalogoId = fila.id;
        fuera = false;
      } else if (!marca || !linea) {
        throw solicitudInvalida('Elige tu vehículo del catálogo o escribe su marca y línea.');
      }

      const [existente] = await tx
        .select({ id: vehiculo.id })
        .from(vehiculo)
        .where(eq(vehiculo.placa, placa));
      if (existente)
        throw conflicto(
          'PLACA_REGISTRADA',
          'Esa placa ya está registrada. Si es tu vehículo, comunícate con soporte.',
        );

      const [creado] = await tx
        .insert(vehiculo)
        .values({
          placa,
          marca: marca as string,
          linea: linea as string,
          modeloAnio: datos.modeloAnio,
          color: datos.color.trim(),
          categoria,
          catalogoVehiculoId: catalogoId,
          fueraDeCatalogo: fuera,
        })
        .returning({ id: vehiculo.id });
      await tx
        .insert(conductorVehiculo)
        .values({ conductorId, vehiculoId: creado!.id, relacion: 'propietario' });

      // El primer vehículo queda activo de una vez.
      const [yo] = await tx
        .select({ activo: conductor.vehiculoActivoId })
        .from(conductor)
        .where(eq(conductor.usuarioId, conductorId));
      if (!yo?.activo)
        await tx
          .update(conductor)
          .set({ vehiculoActivoId: creado!.id })
          .where(eq(conductor.usuarioId, conductorId));

      return { id: creado!.id, categoria, fueraDeCatalogo: fuera };
    });
  }

  /** Cambia el vehículo con el que trabaja. No se puede mientras está conectado. */
  async activar(conductorId: string, vehiculoId: string): Promise<void> {
    const { db } = this.bd;
    const [vinculo] = await db
      .select({ v: conductorVehiculo.vehiculoId })
      .from(conductorVehiculo)
      .where(
        and(
          eq(conductorVehiculo.conductorId, conductorId),
          eq(conductorVehiculo.vehiculoId, vehiculoId),
        ),
      );
    if (!vinculo) throw noEncontrado('VEHICULO_NO_ENCONTRADO', 'Ese vehículo no está en tu cuenta');
    const [yo] = await db
      .select({ op: conductor.estadoOperativo })
      .from(conductor)
      .where(eq(conductor.usuarioId, conductorId));
    if (yo && yo.op !== 'desconectado') {
      throw conflicto('CONECTADO', 'Desconéctate antes de cambiar de vehículo.');
    }
    await db
      .update(conductor)
      .set({ vehiculoActivoId: vehiculoId })
      .where(eq(conductor.usuarioId, conductorId));
  }
}
