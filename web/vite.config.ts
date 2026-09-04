import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(() => ({
  /**
   * Raíz de URLs para `index.html`, JS y CSS del build.
   * Debe ser `/` en Vercel (y casi todos los hosts que publican el sitio en la raíz del dominio).
   * Si fuera `/portal-transaccional-interno/`, el HTML pediría esos assets en esa ruta y el servidor
   * los tiene en `/assets/…` → 404 → pantalla en blanco.
   * El prefijo del panel operativo es solo en React Router (`PORTAL_BASE` en `portalPath.ts`), no aquí.
   */
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    /** Túneles (ngrok, etc.): Vite rechaza hosts desconocidos sin esto. Solo aplica al dev server. */
    allowedHosts: true as const,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}))
