import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FiscalResolutionKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { formatDocumentNumber } from './document-number';

type ConsecutiveAssignment = {
  resolutionId: string;
  kind: FiscalResolutionKind;
  prefix: string;
  consecutiveNumber: number;
  documentNumber: string;
  resolutionNumber: string;
};

/**
 * Asigna números consecutivos de forma **atómica** dentro de una transacción.
 *
 * Reglas clave:
 *  - Bloquea la fila de la resolución con `SELECT … FOR UPDATE` antes de avanzar
 *    `nextNumber`, para que concurrencias no produzcan números duplicados.
 *  - Rechaza si la resolución está inactiva, vencida o agotada.
 *  - Devuelve el número asignado junto con el `documentNumber` ya formateado.
 *
 * No ejecuta auditoría; el llamador (InvoicesService / CreditNotesService)
 * consolida la auditoría del documento completo.
 */
@Injectable()
export class InvoiceNumberingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asigna el siguiente consecutivo para una resolución concreta o para la resolución
   * default activa del tipo indicado (`ELECTRONIC_INVOICE`, `POS`, etc.).
   */
  async assignConsecutive(
    tx: Prisma.TransactionClient,
    opts:
      | { resolutionId: string }
      | { kind: FiscalResolutionKind; preferredResolutionId?: string },
  ): Promise<ConsecutiveAssignment> {
    const resolution = await this.resolveWithLock(tx, opts);

    if (!resolution.isActive) {
      throw new BadRequestException(
        `La resolución ${resolution.prefix}/${resolution.resolutionNumber} está inactiva.`,
      );
    }
    const today = new Date();
    if (resolution.validUntil && resolution.validUntil < today) {
      throw new BadRequestException(
        `La resolución ${resolution.prefix}/${resolution.resolutionNumber} está vencida (validUntil ${resolution.validUntil.toISOString().slice(0, 10)}).`,
      );
    }
    if (resolution.validFrom && resolution.validFrom > today) {
      throw new BadRequestException(
        `La resolución ${resolution.prefix}/${resolution.resolutionNumber} aún no entra en vigencia.`,
      );
    }
    if (resolution.nextNumber > resolution.rangeTo) {
      throw new ConflictException(
        `La resolución ${resolution.prefix}/${resolution.resolutionNumber} está agotada (sin números disponibles).`,
      );
    }

    const consecutiveNumber = resolution.nextNumber;
    await tx.fiscalResolution.update({
      where: { id: resolution.id },
      data: { nextNumber: consecutiveNumber + 1 },
    });

    return {
      resolutionId: resolution.id,
      kind: resolution.kind,
      prefix: resolution.prefix,
      consecutiveNumber,
      documentNumber: formatDocumentNumber(resolution.prefix, consecutiveNumber),
      resolutionNumber: resolution.resolutionNumber,
    };
  }

  private async resolveWithLock(
    tx: Prisma.TransactionClient,
    opts:
      | { resolutionId: string }
      | { kind: FiscalResolutionKind; preferredResolutionId?: string },
  ): Promise<ReturnType<typeof normalizeRow>> {
    if ('resolutionId' in opts && opts.resolutionId) {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          kind: FiscalResolutionKind;
          resolution_number: string;
          prefix: string;
          range_from: number;
          range_to: number;
          next_number: number;
          valid_from: Date | null;
          valid_until: Date | null;
          is_active: boolean;
        }>
      >(Prisma.sql`
        SELECT id, kind, resolution_number, prefix, range_from, range_to, next_number,
               valid_from, valid_until, is_active
        FROM "fiscal_resolutions"
        WHERE id = ${opts.resolutionId}
        FOR UPDATE
      `);
      const row = rows[0];
      if (!row) throw new NotFoundException('Resolución fiscal no encontrada.');
      return normalizeRow(row);
    }

    if (!('kind' in opts)) {
      throw new NotFoundException('Resolución fiscal no especificada.');
    }
    const kind = opts.kind;
    const preferred = opts.preferredResolutionId;
    if (preferred) {
      return this.resolveWithLock(tx, { resolutionId: preferred });
    }
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        kind: FiscalResolutionKind;
        resolution_number: string;
        prefix: string;
        range_from: number;
        range_to: number;
        next_number: number;
        valid_from: Date | null;
        valid_until: Date | null;
        is_active: boolean;
      }>
    >(Prisma.sql`
      SELECT id, kind, resolution_number, prefix, range_from, range_to, next_number,
             valid_from, valid_until, is_active
      FROM "fiscal_resolutions"
      WHERE kind = ${kind}::"FiscalResolutionKind"
        AND is_active = true
        AND is_default = true
      ORDER BY updated_at DESC
      LIMIT 1
      FOR UPDATE
    `);
    const row = rows[0];
    if (!row) {
      throw new BadRequestException(
        `No hay resolución DIAN activa marcada como default para tipo ${kind}. Configúrela en el panel de Administración.`,
      );
    }
    return normalizeRow(row);
  }
}

function normalizeRow(row: {
  id: string;
  kind: FiscalResolutionKind;
  resolution_number: string;
  prefix: string;
  range_from: number;
  range_to: number;
  next_number: number;
  valid_from: Date | null;
  valid_until: Date | null;
  is_active: boolean;
}) {
  return {
    id: row.id,
    kind: row.kind,
    resolutionNumber: row.resolution_number,
    prefix: row.prefix,
    rangeFrom: row.range_from,
    rangeTo: row.range_to,
    nextNumber: row.next_number,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    isActive: row.is_active,
  };
}
