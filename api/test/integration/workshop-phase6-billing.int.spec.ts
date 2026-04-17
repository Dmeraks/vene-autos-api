/**
 * Fase 4 · Facturación electrónica (preparación DIAN).
 *
 * Exige migraciones aplicadas + seed (usuario administrador, unidades de medida).
 * Verifica:
 *  - Alta de resolución DIAN (ELECTRONIC_INVOICE) marcada default.
 *  - Creación de factura a partir de una venta confirmada → snapshot de líneas y totales.
 *  - Intento de emisión con NoopDianProvider deja la factura en DRAFT + dispatch NOT_CONFIGURED.
 *  - Anular DRAFT está permitido; `VOIDED` bloquea segunda anulación.
 *  - `createCreditNote` contra una factura ISSUED (la marcamos manualmente) genera NC en DRAFT.
 *  - Un segundo `createFromSale` a la misma venta es rechazado mientras la factura viva exista.
 */
import {
  CreditNoteReason,
  FiscalResolutionKind,
  InvoiceStatus,
  SaleStatus,
} from '@prisma/client';
import { DianProviderFactory } from '../../src/common/dian/dian-provider.factory';
import { CreditNotesService } from '../../src/modules/billing/credit-notes.service';
import { FiscalResolutionsService } from '../../src/modules/billing/fiscal-resolutions.service';
import { InvoiceNumberingService } from '../../src/modules/billing/invoice-numbering.service';
import { InvoicesService } from '../../src/modules/billing/invoices.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { JwtUserPayload } from '../../src/modules/auth/types/jwt-user.payload';

describe('Phase 6 · Billing DIAN (integración)', () => {
  let prisma: PrismaService;
  let actorId: string;
  let resolutions: FiscalResolutionsService;
  let numbering: InvoiceNumberingService;
  let invoices: InvoicesService;
  let creditNotes: CreditNotesService;
  const audit = { recordDomain: jest.fn().mockResolvedValue(undefined) };

  const ids: {
    resolutions: string[];
    invoices: string[];
    creditNotes: string[];
    sales: string[];
    customers: string[];
  } = { resolutions: [], invoices: [], creditNotes: [], sales: [], customers: [] };

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
      'credit_notes:create',
      'credit_notes:read',
      'fiscal_resolutions:read',
      'fiscal_resolutions:manage',
    ],
  });

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL es obligatoria para tests de integración');
    }
    prisma = new PrismaService();
    await prisma.$connect();

    const adminMembership = await prisma.userRole.findFirst({
      where: { role: { slug: 'administrador' }, user: { isActive: true } },
      select: { userId: true },
    });
    if (!adminMembership) {
      throw new Error('Seed requerido: falta usuario con rol administrador');
    }
    actorId = adminMembership.userId;

    resolutions = new FiscalResolutionsService(prisma, audit as never);
    numbering = new InvoiceNumberingService(prisma);
    const providerFactory = new DianProviderFactory(prisma);
    invoices = new InvoicesService(prisma, audit as never, numbering, providerFactory);
    creditNotes = new CreditNotesService(prisma, audit as never, numbering, providerFactory);
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const cn of ids.creditNotes) {
      await prisma.creditNoteLine.deleteMany({ where: { creditNoteId: cn } }).catch(() => undefined);
      await prisma.creditNote.delete({ where: { id: cn } }).catch(() => undefined);
    }
    for (const inv of ids.invoices) {
      await prisma.invoiceDispatchEvent
        .deleteMany({ where: { invoiceId: inv } })
        .catch(() => undefined);
      await prisma.invoiceLine.deleteMany({ where: { invoiceId: inv } }).catch(() => undefined);
      await prisma.invoice.delete({ where: { id: inv } }).catch(() => undefined);
    }
    for (const saleId of ids.sales) {
      await prisma.saleLine.deleteMany({ where: { saleId } }).catch(() => undefined);
      await prisma.sale.delete({ where: { id: saleId } }).catch(() => undefined);
    }
    for (const cid of ids.customers) {
      await prisma.customer.delete({ where: { id: cid } }).catch(() => undefined);
    }
    for (const rid of ids.resolutions) {
      await prisma.fiscalResolution.delete({ where: { id: rid } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function createConfirmedSale(lineCount = 1) {
    const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const customer = await prisma.customer.create({
      data: { displayName: `Cliente fact ${tag}`, primaryPhone: '3001111111' },
    });
    ids.customers.push(customer.id);

    const sale = await prisma.sale.create({
      data: {
        publicCode: `VTA-TEST-${tag.toUpperCase()}`.slice(0, 30),
        status: SaleStatus.CONFIRMED,
        origin: 'COUNTER',
        customerId: customer.id,
        customerName: customer.displayName,
        customerDocumentId: '900123456',
        confirmedAt: new Date(),
        createdById: actorId,
        lines: {
          create: Array.from({ length: lineCount }).map((_, i) => ({
            lineType: 'PART',
            sortOrder: i,
            description: `Ítem ${i + 1}`,
            quantity: '2',
            unitPrice: '1500',
            discountAmount: '0',
          })),
        },
      },
    });
    ids.sales.push(sale.id);
    return sale;
  }

  it('registra resolución default activa y asigna consecutivos monotónicos', async () => {
    const tag = Date.now().toString(36).slice(-4).toUpperCase();
    const res = await resolutions.create(
      actor(),
      {
        kind: FiscalResolutionKind.ELECTRONIC_INVOICE,
        resolutionNumber: `RES-${tag}`,
        prefix: `F${tag}`,
        rangeFrom: 1,
        rangeTo: 100,
        isDefault: true,
      },
      {},
    );
    ids.resolutions.push(res.id);
    expect(res.nextNumber).toBe(1);
    expect(res.isDefault).toBe(true);
    expect(res.isActive).toBe(true);

    const first = await prisma.$transaction(async (tx) =>
      numbering.assignConsecutive(tx, { resolutionId: res.id }),
    );
    const second = await prisma.$transaction(async (tx) =>
      numbering.assignConsecutive(tx, { resolutionId: res.id }),
    );
    expect(first.consecutiveNumber).toBe(1);
    expect(second.consecutiveNumber).toBe(2);
    expect(second.documentNumber.startsWith(`F${tag}`)).toBe(true);

    const after = await resolutions.findOne(res.id);
    expect(after.nextNumber).toBe(3);
  });

  it('crea factura desde venta confirmada: snapshot de líneas + totales consistentes', async () => {
    const sale = await createConfirmedSale(2);
    const invoice = await invoices.createFromSale(sale.id, actor(), {}, {});
    ids.invoices.push(invoice.id);

    expect(invoice.status).toBe(InvoiceStatus.DRAFT);
    expect(invoice.saleId).toBe(sale.id);
    expect(invoice.lines).toHaveLength(2);
    expect(Number(invoice.subtotal)).toBeCloseTo(2 * 2 * 1500, 2);
    expect(Number(invoice.grandTotal)).toBeCloseTo(Number(invoice.subtotal), 2);

    // Re-facturar la misma venta mientras la factura vive está prohibido.
    await expect(
      invoices.createFromSale(sale.id, actor(), {}, {}),
    ).rejects.toThrow(/ya tiene una factura viva/i);
  });

  it('emitir con DIAN apagado deja la factura en DRAFT con dispatch NOT_CONFIGURED', async () => {
    const sale = await createConfirmedSale(1);
    const created = await invoices.createFromSale(sale.id, actor(), {}, {});
    ids.invoices.push(created.id);

    const afterIssue = await invoices.issue(created.id, actor(), {});
    expect(afterIssue.status).toBe(InvoiceStatus.DRAFT);
    expect(afterIssue.dispatchEvents).toHaveLength(1);
    expect(afterIssue.dispatchEvents[0].status).toBe('NOT_CONFIGURED');
  });

  it('anula factura en DRAFT; bloquea segunda anulación', async () => {
    const sale = await createConfirmedSale(1);
    const inv = await invoices.createFromSale(sale.id, actor(), {}, {});
    ids.invoices.push(inv.id);

    const voided = await invoices.void(inv.id, actor(), { reason: 'Cliente canceló pedido' }, {});
    expect(voided.status).toBe(InvoiceStatus.VOIDED);
    expect(voided.voidedReason).toContain('Cliente');

    await expect(
      invoices.void(inv.id, actor(), { reason: 'segundo intento' }, {}),
    ).rejects.toThrow(/ya está anulada/i);
  });

  it('emite NC contra una factura marcada ISSUED (simulación)', async () => {
    const sale = await createConfirmedSale(1);
    const inv = await invoices.createFromSale(sale.id, actor(), {}, {});
    ids.invoices.push(inv.id);

    // Simular aceptación DIAN: promover DRAFT → ISSUED directamente en BD para el test.
    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        status: InvoiceStatus.ISSUED,
        cufe: 'test-cufe-abc123',
        dianProvider: 'noop',
        dianEnvironment: 'sandbox',
        issuedAt: new Date(),
      },
    });

    const cn = await creditNotes.createFromInvoice(
      inv.id,
      actor(),
      {
        reason: CreditNoteReason.VOID,
        reasonDescription: 'Cliente devolvió la mercadería',
      },
      {},
    );
    ids.creditNotes.push(cn.id);
    expect(cn.status).toBe('DRAFT');
    expect(cn.lines).toHaveLength(1);
    expect(Number(cn.grandTotal)).toBeGreaterThan(0);
  });
});
