import { applyDecorators } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * IDs de filas en este proyecto usan `@default(cuid())` (Prisma), no UUID RFC.
 * `@IsUUID()` en el DTO hace que el ValidationPipe rechace el body/query con 400
 * antes de que llegue al servicio (p. ej. PATCH `assignedToId` al tomar una OT).
 */
export function IsPrismaCuid() {
  return applyDecorators(IsString(), MinLength(1), MaxLength(128));
}
