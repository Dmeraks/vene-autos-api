/**
 * Código público de cotización (presupuesto), alineado al número interno autoincremental.
 * Formato: `VEN-CQT-` + número con al menos 4 dígitos (ej. VEN-CQT-0001).
 */
export const QUOTE_PUBLIC_CODE_PREFIX = 'VEN-CQT' as const;

export function formatQuotePublicCode(quoteNumber: number): string {
  const s = String(quoteNumber);
  const width = Math.max(4, s.length);
  return `${QUOTE_PUBLIC_CODE_PREFIX}-${s.padStart(width, '0')}`;
}
