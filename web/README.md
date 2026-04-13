# Vene Autos — Panel web (taller)

SPA en **React + Vite + TypeScript** con **Tailwind CSS**. En desarrollo, las peticiones a `/api/v1` se proxifican al API Nest en `http://localhost:3000` (ver `vite.config.ts`).

## Arranque

1. API corriendo (`cd api && npm run start:dev`) y base de datos lista.
2. Desde la raíz del monorepo: `npm run web:dev`  
   o dentro de `web/`: `npm run dev`
3. Abrir **http://localhost:5173** e iniciar sesión.

## Producción

Definí `VITE_API_BASE` con la URL pública del API (sin barra final) antes de `npm run build`. Los assets quedan en `web/dist/`.
