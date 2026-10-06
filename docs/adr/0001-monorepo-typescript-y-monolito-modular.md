# 0001 · Monorepo TypeScript y backend como monolito modular

- **Estado:** Aceptada
- **Fecha:** 2026-10-06

## Contexto

Hay que construir tres aplicaciones cliente y un backend con tiempo real. El equipo inicial será pequeño, y las
tres apps comparten muchos conceptos: estados del viaje, cálculo de tarifas, tipos de la API y componentes
visuales. Negocio eligió un stack TypeScript de punta a punta.

## Decisión

- Un **monorepo** con pnpm workspaces y Turborepo que contiene las tres apps, el backend y paquetes compartidos
  (`dominio`, `sdk`, `ui`, `mapas`, `config`).
- **TypeScript** en todo el sistema: React + Vite para las apps, NestJS para el backend.
- Backend como **monolito modular**: un solo despliegue (con puntos de entrada para API y workers) dividido en
  módulos con fronteras explícitas (ver [arquitectura](../08-arquitectura.md#módulos-del-backend)).

## Alternativas consideradas

- **Microservicios desde el inicio:** más infraestructura, despliegues y depuración distribuida sin un volumen que
  lo justifique. Se descarta por ahora.
- **Repositorios separados por app:** duplicación de tipos y lógica, versiones desalineadas entre apps y API.
- **Backend como servicio (Supabase/Firebase):** más rápido al inicio, pero el despacho, el libro de movimientos y
  la lógica geoespacial necesitan control fino del servidor.

## Consecuencias

- Un cambio en la API y en las apps que la usan va en un mismo PR, con verificación de tipos de punta a punta.
- El cálculo de tarifas y la máquina de estados del viaje se escriben una sola vez en `packages/dominio`.
- Hay que respetar las fronteras entre módulos (revisión de código y reglas de dependencias en el lint) para que
  extraer un servicio más adelante (`ubicacion`, `despacho`) sea viable.
- La CI debe construir y probar solo lo afectado por cada cambio (caché de Turborepo).
