/**
 * Origen canónico del sitio (sin barra final).
 * En producción definí `VITE_SITE_URL=https://www.veneautos.com.co` en el build (p. ej. Vercel).
 * Sin variable, en el navegador se usa `window.location.origin` (útil en localhost).
 */
export function siteOrigin(): string {
  const raw = import.meta.env.VITE_SITE_URL as string | undefined
  if (raw?.trim()) return raw.trim().replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return 'https://www.veneautos.com.co'
}

/** Ciudad/región opcional para texto local (Search Console / rich results). `.env`: `VITE_BUSINESS_LOCALITY=Bogotá` */
export function businessLocality(): string | undefined {
  const v = import.meta.env.VITE_BUSINESS_LOCALITY as string | undefined
  const t = v?.trim()
  return t || undefined
}

export const SITE_BRAND = 'Vene Autos'
