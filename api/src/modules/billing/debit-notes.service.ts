/**
 * Notas débito (Fase 7).
 *
 * Una DN incrementa el valor cobrado sobre una factura ya emitida (ISSUED). Usos
 * típicos: corrección de precio al alza, recargo posterior, intereses de mora.
 * Al emitirse (ISSUED), se suma al saldo cobrable de la factura —reabriendo el
 * cobro en caja si la factura ya estaba saldada.
 *
 * Reglas operativas:
 *  - Solo sobre facturas ISSUED (el saldo fiscal ya está cerrado por DIAN).
 *  - Líneas manuales (description/qty/unitPrice/discount/taxRatePercent/taxKind).
 *    No se toma snapshot automático de la factura para permitir cargos nuevos.
 *  - Numeración toma la resolución dada o la default de ELECTRONIC_INVOICE.
 *  - DRAFT / ISSUED / VOIDED, mismo ciclo de vida que CN.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DebitNoteStatus,
  FiscalResolutionKind,
  InvoiceStatus,
  Prisma,
  TaxRateKind,
  WorkOrderLineType,
} from '@prisma/client';
import {
  computeLineTotals,
  type LineForTotals,
} from '../../common/billing/billing-totals';
import { DianProviderFactory } from '../../common/dian/dian-provider.factory';
import type { DianDebitNotePayload } from '../../common/dian/dian-provider.interface';
import { decimalFromMoneyApiString } from '../../common/money/cop-money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { AUDIT_DEBIT_NOTE_ENTITY } from './billing.constants';
import type { CreateDebitNoteDto } from './dto/create-debit-note.dto';
import type { VoidDebitNoteDto } from './dto/void-debit-note.dto';
import { InvoiceNumberingService } from './invoice-numbering.service';

const userBrief = { select: { id: true, email: true, fullName: true } };

const debitNoteLineSelect = {
  id: true,
  debitNoteId: true,
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

const debitNoteDetailInclude = {
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
  lines: { orderBy: { sortOrder: 'asc' as const }, select: debitNoteLineSelect },
} satisfies Prisma.DebitNoteInclude;

type DebitNoteDetail = Prisma.DebitNoteGetPayload<{
  include: typeof debitNoteDetailInclude;
}>;

@Injectable()
export class DebitNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: InvoiceNumberingService,
    private readonly providers: DianProviderFactory,
  ) {}

  async list(_actor: JwtUserPayload) {
    const rows = await this.prisma.debitNote.findMany({
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
      debitNoteNumber: r.debitNoteNumber,
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
    const row = await this.prisma.debitNote.findUnique({
      where: { id },
      include: debitNoteDetailInclude,
    });
    if (!row) throw new NotFoundException('Nota débito no encontrada.');
    return this.shape(row);
  }

  async createFromInvoice(
    invoiceId: string,
    actor: JwtUserPayload,
    dto: CreateDebitNoteDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, documentNumber: true },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada.');
    if (invoice.status !== InvoiceStatus.ISSUED) {
      throw new BadRequestException(
        'Solo se puede emitir nota débito contra facturas en estado ISSUED (aceptadas por DIAN).',
      );
    }

    const linesForTotals: LineForTotals[] = dto.lines.map((ln, idx) => ({
      id: `dn-line-${idx}`,
      lineType:
        ln.lineType === 'LABOR' ? WorkOrderLineType.LABOR : WorkOrderLineType.PART,
      quantity: decimalFromMoneyApiString(ln.quantity),
      unitPrice: decimalFromMoneyApiString(ln.unitPrice),
      discountAmount:
        ln.discountAmount != null
          ? decimalFromMoneyApiString(ln.discountAmount)
          : new Prisma.Decimal(0),
      costSnapshot: null,
      taxRateId: null,
      taxRatePercentSnapshot: ln.taxRatePercent
        ? decimalFromMoneyApiString(ln.taxRatePercent)
        : new Prisma.Decimal(0),
      taxRate: ln.taxKind ? { kind: ln.taxKind as TaxRateKind } : null,
    }));

    const lineTotals = linesForTotals.map((ln) => computeLineTotals(ln));
    const subtotal = sumDecimal(lineTotals.map((t) => t.grossAmount));
    const totalDiscount = sumDecimal(lineTotals.map((t) => t.discountAmount));
    const totalTax = sumDecimal(lineTotals.map((t) => t.taxAmount));
    const grandTotal = subtotal.minus(totalDiscount).plus(totalTax);
    if (grandTotal.lte(0)) {
      throw new BadRequestException(
        'El valor total de la nota débito debe ser mayor a cero.',
      );
    }

    const debitNote = await this.prisma.$transaction(async (tx) => {
      const numbering = await this.numbering.assignConsecutive(
        tx,
        dto.fiscalResolutionId
          ? { resolutionId: dto.fiscalResolutionId }
          : { kind: FiscalResolutionKind.ELECTRONIC_INVOICE },
      );

      return tx.debitNote.create({
        data: {
          fiscalResolutionId: numbering.resolutionId,
          debitNoteNumber: numbering.consecutiveNumber,
          documentNumber: numbering.documentNumber,
          invoiceId: invoice.id,
          status: DebitNoteStatus.DRAFT,
          reason: dto.reason,
          reasonDescription: dto.reasonDescription.trim(),
          subtotal,
          totalDiscount,
          totalTax,
          grandTotal,
          createdById: actor.sub,
          lines: {
            create: dto.lines.map((ln, idx) => {
              const t = lineTotals[idx];
              return {
                lineType: ln.lineType,
                sortOrder: ln.sortOrder ?? idx,
                description: ln.description.trim(),
                quantity: decimalFromMoneyApiString(ln.quantity),
                unitPrice: decimalFromMoneyApiString(ln.unitPrice),
                discountAmount:
                  ln.discountAmount != null
                    ? decimalFromMoneyApiString(ln.discountAmount)
                    : new Prisma.Decimal(0),
                taxRatePercentSnapshot: ln.taxRatePercent
                  ? decimalFromMoneyApiString(ln.taxRatePercent)
                  : new Prisma.Decimal(0),
                taxRateKindSnapshot: (ln.taxKind as TaxRateKind | undefined) ?? null,
                lineTotal: t.lineTotal,
                taxAmount: t.taxAmount,
              };
            }),
          },
        },
        include: debitNoteDetailInclude,
      });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'debit_notes.created',
      entityType: AUDIT_DEBIT_NOTE_ENTITY,
      entityId: debitNote.id,
      previousPayload: null,
      nextPayload: {
        invoiceId: invoice.id,
        documentNumber: debitNote.documentNumber,
        reason: debitNote.reason,
        grandTotal: debitNote.grandTotal.toString(),
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.shape(debitNote);
  }

  async issue(id: string, actor: JwtUserPayload, meta: { ip?: string; userAgent?: string }) {
    const dn = await this.prisma.debitNote.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        invoice: { select: { documentNumber: true, cufe: true } },
        fiscalResolution: { select: { prefix: true, resolutionNumber: true } },
      },
    });
    if (!dn) throw new NotFoundException('Nota débito no encontrada.');
    if (dn.status === DebitNoteStatus.ISSUED) {
      throw new ConflictException('La nota débito ya fue emitida.');
    }
    if (dn.status === DebitNoteStatus.VOIDED) {
      throw new ConflictException('La nota débito está anulada; no puede emitirse.');
    }

    const provider = await this.providers.resolve();
    const now = new Date();

    const payload: DianDebitNotePayload = {
      documentNumber: dn.documentNumber,
      debitNoteNumber: dn.debitNoteNumber,
      prefix: dn.fiscalResolution.prefix,
      resolutionNumber: dn.fiscalResolution.resolutionNumber,
      reason: dn.reason,
      reasonDescription: dn.reasonDescription,
      relatedInvoice: {
        documentNumber: dn.invoice.documentNumber,
        cufe: dn.invoice.cufe,
      },
      issuedAt: now.toISOString(),
      totals: {
        subtotal: dn.subtotal.toString(),
        totalDiscount: dn.totalDiscount.toString(),
        totalTax: dn.totalTax.toString(),
        grandTotal: dn.grandTotal.toString(),
      },
      lines: dn.lines.map((ln) => ({
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

    const result = await provider.submitDebitNote(payload);

    if (result.status === 'ACCEPTED') {
      await this.prisma.debitNote.update({
        where: { id: dn.id },
        data: {
          status: DebitNoteStatus.ISSUED,
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
      action: 'debit_notes.issue_attempt',
      entityType: AUDIT_DEBIT_NOTE_ENTITY,
      entityId: dn.id,
      previousPayload: { status: dn.status },
      nextPayload: {
        dispatchStatus: result.status,
        errorMessage: 'errorMessage' in result ? result.errorMessage : null,
        statusAfter:
          result.status === 'ACCEPTED' ? DebitNoteStatus.ISSUED : dn.status,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.findOne(dn.id);
  }

  async void(
    id: string,
    actor: JwtUserPayload,
    dto: VoidDebitNoteDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const dn = await this.prisma.debitNote.findUnique({ where: { id } });
    if (!dn) throw new NotFoundException('Nota débito no encontrada.');
    if (dn.status === DebitNoteStatus.VOIDED) {
      throw new ConflictException('La nota débito ya está anulada.');
    }

    await this.prisma.debitNote.update({
      where: { id: dn.id },
      data: {
        status: DebitNoteStatus.VOIDED,
        voidedAt: new Date(),
        voidedReason: dto.reason.trim(),
        voidedById: actor.sub,
      },
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'debit_notes.voided',
      entityType: AUDIT_DEBIT_NOTE_ENTITY,
      entityId: dn.id,
      previousPayload: { status: dn.status },
      nextPayload: { status: DebitNoteStatus.VOIDED, reason: dto.reason.trim() },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.findOne(dn.id);
  }

  private shape(dn: DebitNoteDetail) {
    return {
      id: dn.id,
      documentNumber: dn.documentNumber,
      debitNoteNumber: dn.debitNoteNumber,
      status: dn.status,
      reason: dn.reason,
      reasonDescription: dn.reasonDescription,
      subtotal: dn.subtotal.toString(),
      totalDiscount: dn.totalDiscount.toString(),
      totalTax: dn.totalTax.toString(),
      grandTotal: dn.grandTotal.toString(),
      cufe: dn.cufe,
      dianProvider: dn.dianProvider,
      dianEnvironment: dn.dianEnvironment,
      issuedAt: dn.issuedAt?.toISOString() ?? null,
      issuedBy: dn.issuedBy,
      voidedAt: dn.voidedAt?.toISOString() ?? null,
      voidedReason: dn.voidedReason,
      voidedBy: dn.voidedBy,
      createdBy: dn.createdBy,
      createdAt: dn.createdAt.toISOString(),
      fiscalResolution: dn.fiscalResolution,
      invoice: dn.invoice,
      lines: dn.lines.map((ln) => ({
        id: ln.id,
        debitNoteId: ln.debitNoteId,
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

function sumDecimal(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((acc, v) => acc.plus(v), new Prisma.Decimal(0));
}
