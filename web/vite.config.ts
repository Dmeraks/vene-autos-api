import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  /** En producción el panel vive bajo /portal-transaccional-interno/; en dev se usa / para comodidad. */
  base: mode === 'production' ? '/portal-transaccional-interno/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    /** Túneles (ngrok, etc.): Vite rechaza hosts desconocidos sin esto. Solo aplica al dev server. */
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}))
