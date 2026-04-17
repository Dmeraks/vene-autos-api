/**
 * Utilidades para formatear el identificador humano de un documento fiscal.
 *
 * La DIAN espera el número consecutivo (sin prefijo) en el XML UBL, pero el
 * taller y el cliente final ven `{prefix}{invoiceNumber}` (ej. `FEV001234`).
 *
 * La función es pura y vive aparte para facilitar tests (no depende de Prisma).
 */

/** Formatea `{prefix}{number}` sin separador. DIAN acepta esta concatenación natural. */
export function formatDocumentNumber(prefix: string, consecutiveNumber: number): string {
  if (!Number.isInteger(consecutiveNumber) || consecutiveNumber < 1) {
    throw new Error('formatDocumentNumber: consecutive number debe ser entero positivo');
  }
  const cleanPrefix = (prefix ?? '').trim().toUpperCase();
  if (!cleanPrefix) {
    throw new Error('formatDocumentNumber: prefix vacío');
  }
  return `${cleanPrefix}${consecutiveNumber}`;
}
