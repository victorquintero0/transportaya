import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('No se encontró el elemento #raiz');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
