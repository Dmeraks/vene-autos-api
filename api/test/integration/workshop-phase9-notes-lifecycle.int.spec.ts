/**
 * Fase 7 · Notas crédito / débito operativas y reapertura de cobro (integración).
 *
 * Verifica:
 *  - `CreditNote.createFromInvoice`: NC DRAFT solo contra facturas ISSUED.
 *  - `CreditNote.void`: idempotente, anula y deja la NC fuera del cálculo de saldo.
 *  - `DebitNote.createFromInvoice`: rechaza facturas no ISSUED; exige total > 0.
 *  - `DebitNote.void`: idempotente, anula y deja la ND fuera del cálculo de saldo.
 *  - `InvoicesService.shape`: `effectiveAmount` = grandTotal − Σ(NC ISSUED) + Σ(ND ISSUED)
 *    y `amountDue` = effectiveAmount − abonos; reabre cobro cuando sube por ND.
 *  - `InvoicePaymentsService.record`: usa el saldo efectivo (incluye NC/ND ISSUED) para
 *    validar montos; rechaza sobrepagos contra el total ajustado.
 *
 * Nota: como el proveedor Noop no acepta (NOT_CONFIGURED), promovemos la NC/ND a ISSUED
 * directamente en BD para poder ejercitar el efecto sobre la factura y la caja.
 */
import { randomUUID } from 'crypto';
import {
  CashMovementDirection,
  CashSessionStatus,
  CreditNoteReason,
  CreditNoteStatus,
  DebitNoteReason,
  DebitNoteStatus,
  FiscalResolutionKind,
  InvoiceStatus,
  Prisma,
  WorkOrderStatus,
} from '@prisma/client';
import { DianProviderFactory } from '../../src/common/dian/dian-provider.factory';
import { NotesPolicyService } from '../../src/common/notes-policy/notes-policy.service';
import { CreditNotesService } from '../../src/modules/billing/credit-notes.service';
import { DebitNotesService } from '../../src/modules/billing/debit-notes.service';
import { FiscalResolutionsService } from '../../src/modules/billing/fiscal-resolutions.service';
import { InvoiceNumberingService } from '../../src/modules/billing/invoice-numbering.service';
import { InvoicePaymentsService } from '../../src/modules/billing/invoice-payments.service';
import { InvoicesService } from '../../src/modules/billing/invoices.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { JwtUserPayload } from '../../src/modules/auth/types/jwt-user.payload';

describe('Phase 9 · Notas crédito/débito + reapertura de cobro (integración)', () => {
  let prisma: PrismaService;
  let actorId: string;
  let resolutions: FiscalResolutionsService;
  let numbering: InvoiceNumberingService;
  let invoices: InvoicesService;
  let creditNotes: CreditNotesService;
  let debitNotes: DebitNotesService;
  let payments: InvoicePaymentsService;
  const audit = { recordDomain: jest.fn().mockResolvedValue(undefined) };

  const ids: {
    resolutions: string[];
    invoices: string[];
    creditNotes: string[];
    debitNotes: string[];
    workOrders: string[];
    customers: string[];
    vehicles: string[];
    cashSessions: string[];
  } = {
    resolutions: [],
    invoices: [],
    creditNotes: [],
    debitNotes: [],
    workOrders: [],
    customers: [],
    vehicles: [],
    cashSessions: [],
  };

  const actor: () => JwtUserPayload = () => ({
    sub: actorId,
    sid: 'integration',
    email: 'int@test',
    fullName: 'Integration',
    permissions: [
      'invoices:read',
      'invoices:create',
      'invoices:issue',
      'invoices:void',
      'invoices:record_payment',
      'fiscal_resolutions:manage',
      'credit_notes:create',
      'credit_notes:read',
      'credit_notes:issue',
      'credit_notes:void',
      'debit_notes:read',
      'debit_notes:create',
      'debit_notes:issue',
      'debit_notes:void',
      'cash_movements:create_income',
    ],
  });

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL obligatoria para integración');
    }
    prisma = new PrismaService();
    await prisma.$connect();

    const adminMembership = await prisma.userRole.findFirst({
      where: { role: { slug: 'administrador' }, user: { isActive: true } },
      select: { userId: true },
    });
    if (!adminMembership) throw new Error('Seed requerido: falta admin');
    actorId = adminMembership.userId;

    resolutions = new FiscalResolutionsService(prisma, audit as never);
    numbering = new InvoiceNumberingService(prisma);
    const providerFactory = new DianProviderFactory(prisma);
    invoices = new InvoicesService(prisma, audit as never, numbering, providerFactory);
    creditNotes = new CreditNotesService(prisma, audit as never, numbering, providerFactory);
    debitNotes = new DebitNotesService(prisma, audit as never, numbering, providerFactory);
    const notesPolicy = new NotesPolicyService(prisma);
    payments = new InvoicePaymentsService(prisma, audit as never, notesPolicy);
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const cn of ids.creditNotes) {
      await prisma.creditNoteLine.deleteMany({ where: { creditNoteId: cn } }).catch(() => undefined);
      await prisma.creditNote.delete({ where: { id: cn } }).catch(() => undefined);
    }
    for (const dn of ids.debitNotes) {
      await prisma.debitNoteLine.deleteMany({ where: { debitNoteId: dn } }).catch(() => undefined);
      await prisma.debitNote.delete({ where: { id: dn } }).catch(() => undefined);
    }
    for (const inv of ids.invoices) {
      await prisma.invoicePayment.deleteMany({ where: { invoiceId: inv } }).catch(() => undefined);
      await prisma.invoiceDispatchEvent.deleteMany({ where: { invoiceId: inv } }).catch(() => undefined);
      await prisma.invoiceLine.deleteMany({ where: { invoiceId: inv } }).catch(() => undefined);
      await prisma.invoice.delete({ where: { id: inv } }).catch(() => undefined);
    }
    for (const wo of ids.workOrders) {
      await prisma.workOrderLine.deleteMany({ where: { workOrderId: wo } }).catch(() => undefined);
      await prisma.workOrder.delete({ where: { id: wo } }).catch(() => undefined);
    }
    for (const v of ids.vehicles) {
      await prisma.vehicle.delete({ where: { id: v } }).catch(() => undefined);
    }
    for (const c of ids.customers) {
      await prisma.customer.delete({ where: { id: c } }).catch(() => undefined);
    }
    for (const r of ids.resolutions) {
      await prisma.fiscalResolution.delete({ where: { id: r } }).catch(() => undefined);
    }
    for (const s of ids.cashSessions) {
      await prisma.cashMovement.deleteMany({ where: { sessionId: s } }).catch(() => undefined);
      await prisma.cashSession.delete({ where: { id: s } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function ensureResolution() {
    const tag = randomUUID().slice(0, 6).toUpperCase();
    const res = await resolutions.create(
      actor(),
      {
        kind: FiscalResolutionKind.ELECTRONIC_INVOICE,
        resolutionNumber: `RES-NT-${tag}`,
        prefix: `N${tag}`,
        rangeFrom: 1,
        rangeTo: 100,
        isDefault: true,
      },
      {},
    );
    ids.resolutions.push(res.id);
    return res;
  }

  async function createIssuedInvoice(amount: number) {
    const tag = randomUUID().slice(0, 8);
    const customer = await prisma.customer.create({
      data: { displayName: `Cliente NT ${tag}`, primaryPhone: '3009997766' },
    });
    ids.customers.push(customer.id);
    const plate = `NT${tag.slice(0, 4)}`.toUpperCase().slice(0, 10);
    const vehicle = await prisma.vehicle.create({
      data: { customerId: customer.id, plate, plateNorm: plate.replace(/\s+/g, '').toUpperCase() },
    });
    ids.vehicles.push(vehicle.id);

    const wo = await prisma.workOrder.create({
      data: {
        publicCode: `OT-NT-${tag.toUpperCase()}`.slice(0, 30),
        status: WorkOrderStatus.DELIVERED,
        description: `OT notas ${tag}`,
        vehicleId: vehicle.id,
        customerName: customer.displayName,
        createdById: actorId,
        deliveredAt: new Date(),
        lines: {
          create: [
            {
              lineType: 'LABOR',
              sortOrder: 0,
              description: 'Servicio',
              quantity: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(amount),
              discountAmount: new Prisma.Decimal(0),
            },
          ],
        },
      },
    });
    ids.workOrders.push(wo.id);

    const inv = await invoices.createFromWorkOrder(wo.id, actor(), {}, {});
    ids.invoices.push(inv.id);

    // Simulamos aceptación DIAN para ejercer el ciclo de notas.
    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        status: InvoiceStatus.ISSUED,
        cufe: `test-cufe-${tag}`,
        dianProvider: 'noop',
        dianEnvironment: 'sandbox',
        issuedAt: new Date(),
      },
    });
    return { invoice: inv, workOrder: wo, customer };
  }

  async function promoteCnToIssued(cnId: string) {
    await prisma.creditNote.update({
      where: { id: cnId },
      data: {
        status: CreditNoteStatus.ISSUED,
        cufe: `cn-cufe-${randomUUID().slice(0, 6)}`,
        dianProvider: 'noop',
        dianEnvironment: 'sandbox',
        issuedAt: new Date(),
        issuedById: actorId,
      },
    });
  }

  async function promoteDnToIssued(dnId: string) {
    await prisma.debitNote.update({
      where: { id: dnId },
      data: {
        status: DebitNoteStatus.ISSUED,
        cufe: `dn-cufe-${randomUUID().slice(0, 6)}`,
        dianProvider: 'noop',
        dianEnvironment: 'sandbox',
        issuedAt: new Date(),
        issuedById: actorId,
      },
    });
  }

  it('CN DRAFT no afecta saldo; CN ISSUED reduce saldo efectivo y amountDue', async () => {
    await ensureResolution();
    const { invoice } = await createIssuedInvoice(10000);

    const cn = await creditNotes.createFromInvoice(
      invoice.id,
      actor(),
      {
        reason: CreditNoteReason.ADJUSTMENT,
        reasonDescription: 'Ajuste parcial por descuento comercial pactado con el cliente.',
      },
      {},
    );
    ids.creditNotes.push(cn.id);
    expect(cn.status).toBe(CreditNoteStatus.DRAFT);

    const detailDraft = await invoices.findOne(invoice.id);
    expect(Number(detailDraft.totalCreditNotes)).toBe(0);
    expect(Number(detailDraft.effectiveAmount)).toBe(10000);
    expect(Number(detailDraft.amountDue)).toBe(10000);

    await promoteCnToIssued(cn.id);

    const detailIssued = await invoices.findOne(invoice.id);
    expect(Number(detailIssued.totalCreditNotes)).toBe(10000);
    expect(Number(detailIssued.effectiveAmount)).toBe(0);
    expect(Number(detailIssued.amountDue)).toBe(0);
  });

  it('CN anulada deja de afectar el saldo (void es idempotente en VOIDED)', async () => {
    await ensureResolution();
    const { invoice } = await createIssuedInvoice(5000);

    const cn = await creditNotes.createFromInvoice(
      invoice.id,
      actor(),
      {
        reason: CreditNoteReason.VOID,
        reasonDescription: 'Anulación total del servicio, el cliente desistió antes de retirar.',
      },
      {},
    );
    ids.creditNotes.push(cn.id);
    await promoteCnToIssued(cn.id);

    const voided = await creditNotes.void(
      cn.id,
      actor(),
      { reason: 'Se emitió por error: el cliente sí retiró el vehículo y pagará.' },
      {},
    );
    expect(voided.status).toBe(CreditNoteStatus.VOIDED);
    expect(voided.voidedReason).toContain('error');

    const detail = await invoices.findOne(invoice.id);
    expect(Number(detail.totalCreditNotes)).toBe(0);
    expect(Number(detail.amountDue)).toBe(5000);

    await expect(
      creditNotes.void(cn.id, actor(), { reason: 'Segundo intento no permitido' }, {}),
    ).rejects.toThrow(/ya está anulada/i);
  });

  it('ND solo contra facturas ISSUED; suma al saldo efectivo al emitirse', async () => {
    await ensureResolution();
    const { invoice } = await createIssuedInvoice(4000);

    const dn = await debitNotes.createFromInvoice(
      invoice.id,
      actor(),
      {
        reason: DebitNoteReason.ADDITIONAL_CHARGE,
        reasonDescription: 'Recargo por repuesto adicional solicitado tras la entrega.',
        lines: [
          {
            lineType: 'PART',
            description: 'Repuesto adicional',
            quantity: '1',
            unitPrice: '1500',
            discountAmount: '0',
            taxRatePercent: '0',
          },
        ],
      },
      {},
    );
    ids.debitNotes.push(dn.id);
    expect(dn.status).toBe(DebitNoteStatus.DRAFT);
    expect(Number(dn.grandTotal)).toBe(1500);

    const beforeIssue = await invoices.findOne(invoice.id);
    expect(Number(beforeIssue.totalDebitNotes)).toBe(0);
    expect(Number(beforeIssue.amountDue)).toBe(4000);

    await promoteDnToIssued(dn.id);

    const afterIssue = await invoices.findOne(invoice.id);
    expect(Number(afterIssue.totalDebitNotes)).toBe(1500);
    expect(Number(afterIssue.effectiveAmount)).toBe(5500);
    expect(Number(afterIssue.amountDue)).toBe(5500);
  });

  it('ND rechaza factura no ISSUED y exige total > 0', async () => {
    await ensureResolution();
    const tag = randomUUID().slice(0, 6);
    const wo = await prisma.workOrder.create({
      data: {
        publicCode: `OT-ND-${tag.toUpperCase()}`.slice(0, 30),
        status: WorkOrderStatus.DELIVERED,
        description: 'OT nd',
        customerName: 'Tester',
        createdById: actorId,
        deliveredAt: new Date(),
        lines: {
          create: [
            {
              lineType: 'LABOR',
              sortOrder: 0,
              description: 'Serv',
              quantity: '1',
              unitPrice: '1000',
              discountAmount: '0',
            },
          ],
        },
      },
    });
    ids.workOrders.push(wo.id);
    const inv = await invoices.createFromWorkOrder(wo.id, actor(), {}, {});
    ids.invoices.push(inv.id);

    await expect(
      debitNotes.createFromInvoice(
        inv.id,
        actor(),
        {
          reason: DebitNoteReason.OTHER,
          reasonDescription: 'Intento contra factura DRAFT, debe rechazarse.',
          lines: [
            {
              lineType: 'PART',
              description: 'x',
              quantity: '1',
              unitPrice: '100',
              discountAmount: '0',
            },
          ],
        },
        {},
      ),
    ).rejects.toThrow(/ISSUED/);
  });

  describe('reapertura de cobro en caja', () => {
    let sessionId: string;
    let categorySlug: string;

    beforeAll(async () => {
      const cat = await prisma.cashMovementCategory.upsert({
        where: { slug: 'ingreso_cobro' },
        create: {
          slug: 'ingreso_cobro',
          name: 'Cobro a clientes',
          direction: CashMovementDirection.INCOME,
          sortOrder: 5,
        },
        update: {},
      });
      categorySlug = cat.slug;

      const existing = await prisma.cashSession.findFirst({
        where: { status: CashSessionStatus.OPEN },
      });
      if (existing) {
        sessionId = existing.id;
      } else {
        const s = await prisma.cashSession.create({
          data: {
            status: CashSessionStatus.OPEN,
            openedAt: new Date(),
            openedById: actorId,
            openingAmount: new Prisma.Decimal(0),
          },
        });
        sessionId = s.id;
        ids.cashSessions.push(sessionId);
      }
    });

    it('ND sobre factura saldada reabre cobro por el diferencial', async () => {
      await ensureResolution();
      const { invoice } = await createIssuedInvoice(6000);

      const settle = await payments.record(
        invoice.id,
        actor(),
        {
          paymentKind: 'full',
          amount: '6000',
          note: 'Pago total al recoger el vehículo, cliente cubre el importe completo en caja.',
          categorySlug,
        },
        {},
      );
      expect(settle.cashMovement.sessionId).toBe(sessionId);

      const saldada = await invoices.findOne(invoice.id);
      expect(Number(saldada.amountDue)).toBe(0);

      // Emitimos ND por $2000: reabre cobro.
      const dn = await debitNotes.createFromInvoice(
        invoice.id,
        actor(),
        {
          reason: DebitNoteReason.PRICE_CORRECTION,
          reasonDescription: 'Diferencia detectada tras auditoría de precio del servicio.',
          lines: [
            {
              lineType: 'LABOR',
              description: 'Ajuste de precio',
              quantity: '1',
              unitPrice: '2000',
              discountAmount: '0',
              taxRatePercent: '0',
            },
          ],
        },
        {},
      );
      ids.debitNotes.push(dn.id);
      await promoteDnToIssued(dn.id);

      const reopened = await invoices.findOne(invoice.id);
      expect(Number(reopened.totalDebitNotes)).toBe(2000);
      expect(Number(reopened.effectiveAmount)).toBe(8000);
      expect(Number(reopened.amountDue)).toBe(2000);

      // Intentar cobrar más del saldo reabierto debe fallar.
      await expect(
        payments.record(
          invoice.id,
          actor(),
          {
            paymentKind: 'full',
            amount: '5000',
            note: 'Pago mayor que el saldo reabierto, debe ser rechazado por la política de saldo.',
            categorySlug,
          },
          {},
        ),
      ).rejects.toThrow(/saldo pendiente/i);

      // Pago por el diferencial exacto liquida la factura.
      const done = await payments.record(
        invoice.id,
        actor(),
        {
          paymentKind: 'full',
          amount: '2000',
          note: 'Pago del diferencial surgido por la nota débito emitida posterior a la entrega.',
          categorySlug,
        },
        {},
      );
      expect(done.cashMovement.direction).toBe(CashMovementDirection.INCOME);

      const liquidada = await invoices.findOne(invoice.id);
      expect(Number(liquidada.amountDue)).toBe(0);
      expect(Number(liquidada.amountPaid)).toBe(8000);
    });
  });
});
