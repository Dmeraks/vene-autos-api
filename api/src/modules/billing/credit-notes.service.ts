import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreditNoteStatus,
  FiscalResolutionKind,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import { DianProviderFactory } from '../../common/dian/dian-provider.factory';
import type { DianCreditNotePayload } from '../../common/dian/dian-provider.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { AUDIT_CREDIT_NOTE_ENTITY } from './billing.constants';
import type { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import type { VoidCreditNoteDto } from './dto/void-credit-note.dto';
import { InvoiceNumberingService } from './invoice-numbering.service';

const creditNoteLineSelect = {
  id: true,
  creditNoteId: true,
  sourceInvoiceLineId: true,
  lineType: true,
  sortOrder: true,
  description: true,
  quantity: true,
  unitPrice: true,
  discountAmount: true,
  taxRatePercentSnapshot: true,
  taxRateKindSnapshot: true,
  lineTotal: true,
  taxAmount: true,
} as const;

const userBrief = { select: { id: true, email: true, fullName: true } };

const creditNoteDetailInclude = {
  createdBy: userBrief,
  issuedBy: userBrief,
  voidedBy: userBrief,
  fiscalResolution: {
    select: {
      id: true,
      kind: true,
      prefix: true,
      resolutionNumber: true,
    },
  },
  invoice: {
    select: {
      id: true,
      documentNumber: true,
      cufe: true,
      status: true,
      customerName: true,
    },
  },
  lines: { orderBy: { sortOrder: 'asc' as const }, select: creditNoteLineSelect },
} satisfies Prisma.CreditNoteInclude;

type CreditNoteDetail = Prisma.CreditNoteGetPayload<{
  include: typeof creditNoteDetailInclude;
}>;

@Injectable()
export class CreditNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: InvoiceNumberingService,
    private readonly providers: DianProviderFactory,
  ) {}

  async list(_actor: JwtUserPayload) {
    const rows = await this.prisma.creditNote.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        invoice: { select: { id: true, documentNumber: true, customerName: true } },
        fiscalResolution: { select: { id: true, prefix: true, kind: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      documentNumber: r.documentNumber,
      creditNoteNumber: r.creditNoteNumber,
      status: r.status,
      reason: r.reason,
      grandTotal: r.grandTotal.toString(),
      invoice: r.invoice,
      fiscalResolution: r.fiscalResolution,
      createdAt: r.createdAt.toISOString(),
      issuedAt: r.issuedAt?.toISOString() ?? null,
    }));
  }

  async findOne(id: string) {
    const row = await this.prisma.creditNote.findUnique({
      where: { id },
      include: creditNoteDetailInclude,
    });
    if (!row) throw new NotFoundException('Nota crédito no encontrada.');
    return this.shape(row);
  }

  /**
   * MVP: la NC refleja íntegra la factura (anulación total / 100%). Esto cubre el caso
   * más frecuente (anular una factura ya aceptada por DIAN). En iteraciones futuras se
   * aceptará una selección de líneas parciales (`lines[]` en el DTO).
   */
  async createFromInvoice(
    invoiceId: string,
    actor: JwtUserPayload,
    dto: CreateCreditNoteDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { lines: true },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada.');
    if (invoice.status !== InvoiceStatus.ISSUED) {
      throw new BadRequestException(
        'Solo se puede emitir nota crédito contra facturas en estado ISSUED (aceptadas por DIAN).',
      );
    }
    if (invoice.lines.length === 0) {
      throw new BadRequestException('La factura no tiene líneas que acreditar.');
    }

    const creditNote = await this.prisma.$transaction(async (tx) => {
      const numbering = await this.numbering.assignConsecutive(
        tx,
        dto.fiscalResolutionId
          ? { resolutionId: dto.fiscalResolutionId }
          : { kind: FiscalResolutionKind.ELECTRONIC_INVOICE },
      );

      return tx.creditNote.create({
        data: {
          fiscalResolutionId: numbering.resolutionId,
          creditNoteNumber: numbering.consecutiveNumber,
          documentNumber: numbering.documentNumber,
          invoiceId: invoice.id,
          status: CreditNoteStatus.DRAFT,
          reason: dto.reason,
          reasonDescription: dto.reasonDescription.trim(),
          subtotal: invoice.subtotal,
          totalDiscount: invoice.totalDiscount,
          totalTax: invoice.totalTax,
          grandTotal: invoice.grandTotal,
          createdById: actor.sub,
          lines: {
            create: invoice.lines.map((ln) => ({
              sourceInvoiceLineId: ln.id,
              lineType: ln.lineType,
              sortOrder: ln.sortOrder,
              description:
                ln.description ??
                (ln.lineType === 'LABOR' ? 'Mano de obra' : 'Ítem'),
              quantity: ln.quantity,
              unitPrice: ln.unitPrice,
              discountAmount: ln.discountAmount,
              taxRatePercentSnapshot: ln.taxRatePercentSnapshot,
              taxRateKindSnapshot: ln.taxRateKindSnapshot,
              lineTotal: ln.lineTotal,
              taxAmount: ln.taxAmount,
            })),
          },
        },
        include: creditNoteDetailInclude,
      });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'credit_notes.created',
      entityType: AUDIT_CREDIT_NOTE_ENTITY,
      entityId: creditNote.id,
      previousPayload: null,
      nextPayload: {
        invoiceId: invoice.id,
        documentNumber: creditNote.documentNumber,
        reason: creditNote.reason,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.shape(creditNote);
  }

  // ---------------------------------------------------------------------------
  // Fase 7 · Ciclo de vida: emitir / anular.
  //
  // Regla operativa:
  //  - `issue` intenta enviar al proveedor DIAN (o Noop si está apagado). Si se
  //    acepta, la NC queda ISSUED y, a partir de ese momento, reduce el saldo
  //    efectivo de la factura vía `InvoicesService.shape`.
  //  - `void` cancela una NC local (DRAFT) o aceptada que nunca se usó. Idempotente.
  // ---------------------------------------------------------------------------

  async issue(id: string, actor: JwtUserPayload, meta: { ip?: string; userAgent?: string }) {
    const cn = await this.prisma.creditNote.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        invoice: { select: { documentNumber: true, cufe: true } },
        fiscalResolution: { select: { prefix: true, resolutionNumber: true } },
      },
    });
    if (!cn) throw new NotFoundException('Nota crédito no encontrada.');
    if (cn.status === CreditNoteStatus.ISSUED) {
      throw new ConflictException('La nota crédito ya fue emitida.');
    }
    if (cn.status === CreditNoteStatus.VOIDED) {
      throw new ConflictException('La nota crédito está anulada; no puede emitirse.');
    }

    const provider = await this.providers.resolve();
    const now = new Date();

    const payload: DianCreditNotePayload = {
      documentNumber: cn.documentNumber,
      creditNoteNumber: cn.creditNoteNumber,
      prefix: cn.fiscalResolution.prefix,
      resolutionNumber: cn.fiscalResolution.resolutionNumber,
      reason: cn.reason,
      reasonDescription: cn.reasonDescription,
      relatedInvoice: {
        documentNumber: cn.invoice.documentNumber,
        cufe: cn.invoice.cufe,
      },
      issuedAt: now.toISOString(),
      totals: {
        subtotal: cn.subtotal.toString(),
        totalDiscount: cn.totalDiscount.toString(),
        totalTax: cn.totalTax.toString(),
        grandTotal: cn.grandTotal.toString(),
      },
      lines: cn.lines.map((ln) => ({
        description: ln.description,
        quantity: ln.quantity.toString(),
        unitPrice: ln.unitPrice.toString(),
        discountAmount: ln.discountAmount.toString(),
        taxRatePercent: ln.taxRatePercentSnapshot.toString(),
        taxKind: (ln.taxRateKindSnapshot as 'VAT' | 'INC' | null) ?? null,
        lineTotal: ln.lineTotal.toString(),
        taxAmount: ln.taxAmount.toString(),
      })),
    };

    const result = await provider.submitCreditNote(payload);

    if (result.status === 'ACCEPTED') {
      await this.prisma.creditNote.update({
        where: { id: cn.id },
        data: {
          status: CreditNoteStatus.ISSUED,
          cufe: result.cufe,
          dianProvider: result.provider,
          dianEnvironment: result.environment,
          issuedAt: now,
          issuedById: actor.sub,
        },
      });
    }

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'credit_notes.issue_attempt',
      entityType: AUDIT_CREDIT_NOTE_ENTITY,
      entityId: cn.id,
      previousPayload: { status: cn.status },
      nextPayload: {
        dispatchStatus: result.status,
        errorMessage: 'errorMessage' in result ? result.errorMessage : null,
        statusAfter:
          result.status === 'ACCEPTED' ? CreditNoteStatus.ISSUED : cn.status,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.findOne(cn.id);
  }

  async void(
    id: string,
    actor: JwtUserPayload,
    dto: VoidCreditNoteDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const cn = await this.prisma.creditNote.findUnique({ where: { id } });
    if (!cn) throw new NotFoundException('Nota crédito no encontrada.');
    if (cn.status === CreditNoteStatus.VOIDED) {
      throw new ConflictException('La nota crédito ya está anulada.');
    }

    await this.prisma.creditNote.update({
      where: { id: cn.id },
      data: {
        status: CreditNoteStatus.VOIDED,
        voidedAt: new Date(),
        voidedReason: dto.reason.trim(),
        voidedById: actor.sub,
      },
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'credit_notes.voided',
      entityType: AUDIT_CREDIT_NOTE_ENTITY,
      entityId: cn.id,
      previousPayload: { status: cn.status },
      nextPayload: { status: CreditNoteStatus.VOIDED, reason: dto.reason.trim() },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.findOne(cn.id);
  }

  private shape(cn: CreditNoteDetail) {
    return {
      id: cn.id,
      documentNumber: cn.documentNumber,
      creditNoteNumber: cn.creditNoteNumber,
      status: cn.status,
      reason: cn.reason,
      reasonDescription: cn.reasonDescription,
      subtotal: cn.subtotal.toString(),
      totalDiscount: cn.totalDiscount.toString(),
      totalTax: cn.totalTax.toString(),
      grandTotal: cn.grandTotal.toString(),
      cufe: cn.cufe,
      dianProvider: cn.dianProvider,
      dianEnvironment: cn.dianEnvironment,
      issuedAt: cn.issuedAt?.toISOString() ?? null,
      issuedBy: cn.issuedBy,
      voidedAt: cn.voidedAt?.toISOString() ?? null,
      voidedReason: cn.voidedReason,
      voidedBy: cn.voidedBy,
      createdBy: cn.createdBy,
      createdAt: cn.createdAt.toISOString(),
      fiscalResolution: cn.fiscalResolution,
      invoice: cn.invoice,
      lines: cn.lines.map((ln) => ({
        id: ln.id,
        creditNoteId: ln.creditNoteId,
        sourceInvoiceLineId: ln.sourceInvoiceLineId,
        lineType: ln.lineType,
        sortOrder: ln.sortOrder,
        description: ln.description,
        quantity: ln.quantity.toString(),
        unitPrice: ln.unitPrice.toString(),
        discountAmount: ln.discountAmount.toString(),
        taxRatePercentSnapshot: ln.taxRatePercentSnapshot.toString(),
        taxRateKindSnapshot: ln.taxRateKindSnapshot,
        lineTotal: ln.lineTotal.toString(),
        taxAmount: ln.taxAmount.toString(),
      })),
    };
  }
}
