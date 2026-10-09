import { api } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { Encabezado } from '../componentes/Layout.tsx';
import { PanelEmpresa } from '../componentes/PanelEmpresa.tsx';
import type { EmpresaDetalleDatos } from '../lib/tipos.ts';

/** El portal del administrador corporativo: solo ve y gestiona la empresa a la que pertenece su cuenta (D-09). */
export function MiEmpresa() {
  const { data } = useQuery({
    queryKey: ['empresa', '/v1/op/mi-empresa', 'detalle'],
    queryFn: () => api.get<EmpresaDetalleDatos>('/v1/op/mi-empresa'),
  });
  return (
    <>
      <Encabezado
        titulo={data?.nombre ?? 'Mi empresa'}
        subtitulo="Empleados, centros de costo, políticas de uso, viajes y estados de cuenta"
      />
      <PanelEmpresa base="/v1/op/mi-empresa" modo="portal" />
    </>
  );
}
