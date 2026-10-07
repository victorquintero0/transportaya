import { api } from '@transportaya/ui';
import { ETIQUETA_ROL, ROLES_INTERNOS, type RolInterno } from '@transportaya/dominio';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Encabezado } from '../componentes/Layout.tsx';
import {
  AccionMotivo,
  Boton,
  Campo,
  Entrada,
  Insignia,
  Modal,
  Panel,
  Tabla,
} from '../componentes/ui.tsx';
import { useEjecutar, usePermiso } from '../lib/consultas.ts';
import { fechaHora, hace } from '../lib/fechas.ts';
import type { Empleado } from '../lib/tipos.ts';

function SelectorRoles({
  valor,
  alCambiar,
}: {
  valor: RolInterno[];
  alCambiar: (r: RolInterno[]) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-3">
      {ROLES_INTERNOS.map((r) => (
        <label key={r} className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={valor.includes(r)}
            onChange={() =>
              alCambiar(valor.includes(r) ? valor.filter((x) => x !== r) : [...valor, r])
            }
            className="size-4 accent-[var(--color-ty)]"
          />
          {ETIQUETA_ROL[r]}
        </label>
      ))}
    </fieldset>
  );
}

export function Usuarios() {
  const puedeGestionar = usePermiso('usuarios.gestionar');
  const ejecutar = useEjecutar();
  const { data } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api.get<Empleado[]>('/v1/op/usuarios'),
  });
  const { data: yo } = useQuery({
    queryKey: ['yo'],
    queryFn: () => api.get<{ id: string }>('/v1/op/yo'),
  });
  const [nuevo, setNuevo] = useState({
    nombre: '',
    telefono: '',
    email: '',
    roles: [] as RolInterno[],
  });
  const [editar, setEditar] = useState<{ id: string; roles: RolInterno[] } | null>(null);
  const [secreto, setSecreto] = useState<{ para: string; contrasena: string } | null>(null);
  const refrescar = { invalidar: ['usuarios'] };

  return (
    <>
      <Encabezado
        titulo="Usuarios internos"
        subtitulo="Personal con acceso a la App Operación. Todos usan contraseña y segundo factor."
        acciones={
          puedeGestionar && (
            <AccionMotivo
              id="nuevo-usuario"
              etiqueta="Nuevo usuario"
              icono="mas"
              tamano="md"
              variante="primario"
              sinMotivo
              titulo="Nuevo usuario interno"
              descripcion="Se genera una contraseña temporal que se muestra una sola vez. La persona configura su segundo factor la primera vez que entra."
              valido={
                nuevo.nombre.trim().length >= 3 &&
                nuevo.email.includes('@') &&
                nuevo.telefono.trim().length >= 7 &&
                nuevo.roles.length > 0
              }
              extra={
                <div className="space-y-3">
                  <Campo etiqueta="Nombre completo">
                    <Entrada
                      id="nuevo-nombre"
                      value={nuevo.nombre}
                      onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                    />
                  </Campo>
                  <div className="grid grid-cols-2 gap-3">
                    <Campo etiqueta="Correo">
                      <Entrada
                        id="nuevo-email"
                        type="email"
                        value={nuevo.email}
                        onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
                      />
                    </Campo>
                    <Campo etiqueta="Celular">
                      <Entrada
                        id="nuevo-telefono"
                        value={nuevo.telefono}
                        onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
                        placeholder="300 123 4567"
                      />
                    </Campo>
                  </div>
                  <Campo etiqueta="Roles">
                    <SelectorRoles
                      valor={nuevo.roles}
                      alCambiar={(roles) => setNuevo({ ...nuevo, roles })}
                    />
                  </Campo>
                </div>
              }
              confirmar="Crear usuario"
              alConfirmar={async () => {
                const r = await ejecutar(
                  () =>
                    api.post<{ id: string; contrasenaTemporal: string }>('/v1/op/usuarios', nuevo),
                  { ...refrescar, exito: 'Usuario creado' },
                );
                setSecreto({ para: nuevo.nombre, contrasena: r.contrasenaTemporal });
                setNuevo({ nombre: '', telefono: '', email: '', roles: [] });
              }}
            />
          )
        }
      />
      <div className="space-y-4 p-6">
        <Panel sinRelleno>
          <Tabla
            id="tabla-usuarios"
            filas={data ?? []}
            clave={(u) => u.id}
            columnas={[
              {
                titulo: 'Persona',
                celda: (u) => (
                  <span>
                    <b>{u.nombre}</b>
                    <span className="block text-xs text-suave">{u.email}</span>
                  </span>
                ),
              },
              {
                titulo: 'Roles',
                celda: (u) => (
                  <span className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Insignia key={r} tono="info">
                        {ETIQUETA_ROL[r]}
                      </Insignia>
                    ))}
                  </span>
                ),
              },
              {
                titulo: 'Segundo factor',
                celda: (u) => (
                  <Insignia tono={u.totpActivo ? 'ok' : 'aviso'}>
                    {u.totpActivo ? 'Activo' : 'Pendiente'}
                  </Insignia>
                ),
              },
              {
                titulo: 'Estado',
                celda: (u) => (
                  <Insignia tono={u.activo ? 'ok' : 'error'}>
                    {u.activo ? 'Activo' : 'Desactivado'}
                  </Insignia>
                ),
              },
              {
                titulo: 'Último ingreso',
                celda: (u) =>
                  u.ultimoIngresoEn ? (
                    <span title={fechaHora(u.ultimoIngresoEn)}>{hace(u.ultimoIngresoEn)}</span>
                  ) : (
                    'Nunca'
                  ),
              },
              {
                titulo: '',
                alinear: 'der',
                celda: (u) =>
                  puedeGestionar && (
                    <div className="flex justify-end gap-1.5">
                      <Boton tamano="sm" onClick={() => setEditar({ id: u.id, roles: u.roles })}>
                        Roles
                      </Boton>
                      <AccionMotivo
                        etiqueta="Reiniciar 2.º factor"
                        titulo={`Reiniciar el segundo factor de ${u.nombre}`}
                        descripcion="Cierra sus sesiones. La próxima vez que entre configurará un dispositivo nuevo."
                        confirmar="Reiniciar"
                        alConfirmar={(motivo) =>
                          ejecutar(
                            () =>
                              api.post(`/v1/op/usuarios/${u.id}/reiniciar-segundo-factor`, {
                                motivo,
                              }),
                            { ...refrescar, exito: 'Segundo factor reiniciado' },
                          )
                        }
                      />
                      <AccionMotivo
                        etiqueta="Nueva contraseña"
                        titulo={`Restablecer la contraseña de ${u.nombre}`}
                        descripcion="Se genera una contraseña temporal y se cierran sus sesiones."
                        confirmar="Restablecer"
                        alConfirmar={async (motivo) => {
                          const r = await ejecutar(
                            () =>
                              api.post<{ contrasenaTemporal: string }>(
                                `/v1/op/usuarios/${u.id}/restablecer-contrasena`,
                                { motivo },
                              ),
                            refrescar,
                          );
                          setSecreto({ para: u.nombre, contrasena: r.contrasenaTemporal });
                        }}
                      />
                      {u.id !== yo?.id && (
                        <AccionMotivo
                          etiqueta={u.activo ? 'Desactivar' : 'Reactivar'}
                          variante={u.activo ? 'peligro' : 'primario'}
                          titulo={`${u.activo ? 'Desactivar' : 'Reactivar'} a ${u.nombre}`}
                          alConfirmar={(motivo) =>
                            ejecutar(
                              () =>
                                api.patch(`/v1/op/usuarios/${u.id}`, { activo: !u.activo, motivo }),
                              { ...refrescar, exito: 'Usuario actualizado' },
                            )
                          }
                        />
                      )}
                    </div>
                  ),
              },
            ]}
          />
        </Panel>
      </div>

      <Modal abierto={!!secreto} titulo="Contraseña temporal" alCerrar={() => setSecreto(null)}>
        {secreto && (
          <div className="space-y-3">
            <p className="text-sm text-suave">
              Entrégasela a <b>{secreto.para}</b> por un canal seguro. No se vuelve a mostrar.
            </p>
            <code
              id="contrasena-temporal"
              className="block rounded-lg bg-fondo px-4 py-3 text-center text-lg font-extrabold tracking-wider"
            >
              {secreto.contrasena}
            </code>
            <div className="flex justify-end">
              <Boton variante="primario" onClick={() => setSecreto(null)}>
                Listo
              </Boton>
            </div>
          </div>
        )}
      </Modal>

      <AccionRoles
        editar={editar}
        alCerrar={() => setEditar(null)}
        setEditar={setEditar}
        alGuardar={(motivo) =>
          ejecutar(
            () => api.patch(`/v1/op/usuarios/${editar?.id}`, { roles: editar?.roles, motivo }),
            { ...refrescar, exito: 'Roles actualizados' },
          )
        }
      />
    </>
  );
}

function AccionRoles({
  editar,
  setEditar,
  alCerrar,
  alGuardar,
}: {
  editar: { id: string; roles: RolInterno[] } | null;
  setEditar: (e: { id: string; roles: RolInterno[] } | null) => void;
  alCerrar: () => void;
  alGuardar: (motivo: string) => Promise<unknown>;
}) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal abierto={!!editar} titulo="Cambiar roles" alCerrar={alCerrar}>
      {editar && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            alGuardar(motivo)
              .then(() => {
                setMotivo('');
                setError(null);
                alCerrar();
              })
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'No se pudo guardar'),
              );
          }}
        >
          <SelectorRoles
            valor={editar.roles}
            alCambiar={(roles) => setEditar({ ...editar, roles })}
          />
          <Campo etiqueta="Motivo" ayuda="Queda en la auditoría.">
            <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
          </Campo>
          {error && (
            <p role="alert" className="text-sm font-semibold text-peligro">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" onClick={alCerrar}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              variante="primario"
              deshabilitado={editar.roles.length === 0 || motivo.trim().length < 5}
            >
              Guardar
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
