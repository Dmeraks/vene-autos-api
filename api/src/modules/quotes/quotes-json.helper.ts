/**
 * Nest/Express serializa con `JSON.stringify`; `Prisma.Decimal` no siempre produce JSON estable
 * en objetos anidados. Normalizamos a números/strings antes de responder.
 */
import { Prisma } from '@prisma/client';

function isDecimalLike(v: unknown): v is { toString(): string } {
  return (
    v != null &&
    typeof v === 'object' &&
    typeof (v as { toString?: unknown }).toString === 'function' &&
    (v as { constructor?: { name?: string } }).constructor?.name === 'Decimal'
  );
}

export function quotesJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (v instanceof Prisma.Decimal) return v.toString();
      if (isDecimalLike(v)) return v.toString();
      return v;
    }),
  ) as T;
}
