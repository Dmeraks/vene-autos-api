/**
 * Cola de reintentos DIAN (Fase 5).
 *
 * La emisión a DIAN en Fase 4 es síncrona dentro del controller `POST /invoices/:id/issue`.
 * Fase 5 agrega un entrypoint manual para reprocesar **lotes** de facturas en DRAFT:
 *   - Busca facturas en DRAFT con dispatch fallido (ERROR/REJECTED/NOT_CONFIGURED) o sin despacho.
 *   - Llama a `InvoicesService.issue()` una por una (secuencial, sin concurrencia para no
 *     romper numeración o saturar al proveedor).
 *
 * Diseño simple por ahora: endpoint disparado manualmente por un admin/dueño con
 * permiso `dian:manage_dispatch`. Cuando el proveedor real esté integrado, este
 * mismo servicio se puede llamar desde un cron / job.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { InvoicesService } from './invoices.service';

export type DispatchRunSummary = {
  scanned: number;
  attempted: number;
  accepted: number;
  rejected: number;
  errored: number;
  notConfigured: number;
  skipped: number;
  details: Array<{
    invoiceId: string;
    documentNumber: string;
    status: 'ACCEPTED' | 'REJECTED' | 'ERROR' | 'NOT_CONFIGURED' | 'SKIPPED';
    errorMessage?: string | null;
  }>;
};

@Injectable()
export class DianDispatchService {
  private readonly logger = new Logger(DianDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  /**
   * Reprocesa facturas DRAFT pendientes / fallidas. `batchLimit` acota cuántas
   * toma en una sola corrida para no colgar la UI.
   */
  async runPending(
    actor: JwtUserPayload,
    meta: { ip?: string; userAgent?: string },
    opts: { batchLimit?: number } = {},
  ): Promise<DispatchRunSummary> {
    const batchLimit = Math.min(Math.max(opts.batchLimit ?? 25, 1), 200);

    const drafts = await this.prisma.invoice.findMany({
      where: { status: InvoiceStatus.DRAFT },
      orderBy: { createdAt: 'asc' },
      take: batchLimit,
      select: { id: true, documentNumber: true },
    });

    const summary: DispatchRunSummary = {
      scanned: drafts.length,
      attempted: 0,
      accepted: 0,
      rejected: 0,
      errored: 0,
      notConfigured: 0,
      skipped: 0,
      details: [],
    };

    for (const inv of drafts) {
      try {
        summary.attempted += 1;
        const res = await this.invoices.issue(inv.id, actor, meta);
        const lastDispatch = res.dispatchEvents[0] ?? null;
        const dispatchStatus = lastDispatch?.status ?? 'NOT_CONFIGURED';
        switch (dispatchStatus) {
          case 'ACCEPTED':
            summary.accepted += 1;
            summary.details.push({
              invoiceId: inv.id,
              documentNumber: inv.documentNumber,
              status: 'ACCEPTED',
            });
            break;
          case 'REJECTED':
            summary.rejected += 1;
            summary.details.push({
              invoiceId: inv.id,
              documentNumber: inv.documentNumber,
              status: 'REJECTED',
              errorMessage: lastDispatch?.errorMessage ?? null,
            });
            break;
          case 'ERROR':
            summary.errored += 1;
            summary.details.push({
              invoiceId: inv.id,
              documentNumber: inv.documentNumber,
              status: 'ERROR',
              errorMessage: lastDispatch?.errorMessage ?? null,
            });
            break;
          default:
            summary.notConfigured += 1;
            summary.details.push({
              invoiceId: inv.id,
              documentNumber: inv.documentNumber,
              status: 'NOT_CONFIGURED',
              errorMessage: lastDispatch?.errorMessage ?? null,
            });
        }
      } catch (err) {
        summary.errored += 1;
        summary.details.push({
          invoiceId: inv.id,
          documentNumber: inv.documentNumber,
          status: 'ERROR',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        this.logger.warn(
          `runPending: fallo emitiendo ${inv.documentNumber}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return summary;
  }
}
