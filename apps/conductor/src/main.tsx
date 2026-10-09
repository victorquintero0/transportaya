import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import {
  cargarConfigMapa,
  configurarApi,
  instalarReporteErrores,
  registrarPreferencias,
} from '@transportaya/ui';
import { App } from './App.tsx';
import { useAjustes } from './estado/ajustes.ts';
import './estilos.css';

configurarApi({ app: 'conductor' });
instalarReporteErrores('conductor');
void cargarConfigMapa();
registrarPreferencias(() => useAjustes.getState());

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('No se encontró el elemento #raiz');

const cliente = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 15_000 } },
});

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
