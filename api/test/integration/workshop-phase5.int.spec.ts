/**
 * Inventario y líneas de OT (Fase 5). Requiere migraciones aplicadas y seed (unidades de medida).
 */
import { BadRequestException } from '@nestjs/common';
import { WorkOrderLineType, WorkOrderStatus } from '@prisma/client';
import type { JwtUserPayload } from '../../src/modules/auth/types/jwt-user.payload';
import type { NotesPolicyService } from '../../src/common/notes-policy/notes-policy.service';
import type { CashMovementsService } from '../../src/modules/cash/cash-movements.service';
import { InventoryItemsService } from '../../src/modules/inventory/inventory-items.service';
import { PurchaseReceiptsService } from '../../src/modules/inventory/purchase-receipts.service';
import { WorkOrderLinesService } from '../../src/modules/work-orders/work-order-lines.service';
import { WorkOrdersService } from '../../src/modules/work-orders/work-orders.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const OP_NOTE_STUB = 'N'.repeat(40);

const notesStub = {
  requireOperationalNote: async (_label: string, raw: string | null | undefined) => {
    const s = (raw ?? '').trim();
    if (s.length < 1) {
      throw new BadRequestException('nota requerida');
    }
    return s;
  },
} as unknown as NotesPolicyService;

const cashMovementsStub = {
  recordPurchaseReceiptExpenseInTx: jest.fn().mockResolvedValue({
    id: 'cm-int-stub',
    sessionId: 'sess-int-stub',
  }),
} as unknown as CashMovementsService;

describe('Workshop phase 5 (integración)', () => {
  let prisma: PrismaService;
  let actorId: string;
  const audit = { recordDomain: jest.fn().mockResolvedValue(undefined) };
  let workOrders: WorkOrdersService;
  let workOrderLines: WorkOrderLinesService;
  let inventoryItems: InventoryItemsService;
  let purchaseReceipts: PurchaseReceiptsService;

  function intActor(sub: string): JwtUserPayload {
    return {
      sub,
      sid: 'integration',
      email: 'int@test',
      fullName: 'Integration',
      permissions: [
        'work_orders:read',
        'work_orders:create',
        'work_orders:update',
        'work_order_lines:create',
        'work_order_lines:update',
        'work_order_lines:delete',
        'work_orders:view_financials',
      ],
    };
  }

  const ids: {
    workOrderIds: string[];
    itemIds: string[];
    receiptIds: string[];
    customerIds: string[];
    vehicleIds: string[];
  } = {
    workOrderIds: [],
    itemIds: [],
    receiptIds: [],
    customerIds: [],
    vehicleIds: [],
  };

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
      throw new Error('Se esperaba un usuario activo con rol administrador (ejecutá prisma db seed)');
    }
    actorId = adminMembership.userId;

    workOrders = new WorkOrdersService(prisma, audit as never, notesStub);
    workOrderLines = new WorkOrderLinesService(prisma, audit as never, workOrders);
    inventoryItems = new InventoryItemsService(prisma, audit as never);
    purchaseReceipts = new PurchaseReceiptsService(
      prisma,
      audit as never,
      notesStub,
      cashMovementsStub,
    );
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    for (const woId of ids.workOrderIds) {
      await prisma.workOrderPayment.deleteMany({ where: { workOrderId: woId } }).catch(() => undefined);
      await prisma.workOrderLine.deleteMany({ where: { workOrderId: woId } }).catch(() => undefined);
      await prisma.workOrder.delete({ where: { id: woId } }).catch(() => undefined);
    }
    for (const vId of ids.vehicleIds) {
      await prisma.vehicle.delete({ where: { id: vId } }).catch(() => undefined);
    }
    for (const cId of ids.customerIds) {
      await prisma.customer.delete({ where: { id: cId } }).catch(() => undefined);
    }
    for (const itemId of ids.itemIds) {
      await prisma.inventoryMovement.deleteMany({ where: { inventoryItemId: itemId } }).catch(() => undefined);
    }
    for (const rid of ids.receiptIds) {
      await prisma.purchaseReceipt.delete({ where: { id: rid } }).catch(() => undefined);
    }
    for (const itemId of ids.itemIds) {
      await prisma.inventoryItem.delete({ where: { id: itemId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('recepción de compra aumenta stock; línea PART consume y delete revierte', async () => {
    const tag = Date.now().toString(36).toUpperCase();
    const mu = await prisma.measurementUnit.findUnique({ where: { slug: 'unit' } });
    if (!mu) {
      throw new Error('Falta unidad seed `unit` (ejecutá prisma db seed)');
    }

    const item = await inventoryItems.create(
      actorId,
      {
        sku: `INT-P5-${tag}`,
        name: `Repuesto test ${tag}`,
        measurementUnitSlug: 'unit',
        initialQuantity: '2',
      },
      {},
    );
    ids.itemIds.push(item.id);
    expect(item.quantityOnHand.toString()).toBe('2');

    const receipt = await purchaseReceipts.create(
      actorId,
      {
        note: OP_NOTE_STUB,
        paymentSource: 'BANK_TRANSFER',
        lines: [{ inventoryItemId: item.id, quantity: '5', unitCost: '10' }],
      },
      {},
    );
    ids.receiptIds.push(receipt.id);

    const afterIn = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(afterIn.quantityOnHand.toString()).toBe('7');
    expect(afterIn.averageCost?.toString()).toBe('8');

    const customer = await prisma.customer.create({
      data: { displayName: `P5 ${tag}`, primaryPhone: '3001111111' },
    });
    ids.customerIds.push(customer.id);
    const vehicle = await prisma.vehicle.create({
      data: {
        customerId: customer.id,
        plate: `P5-${tag}`,
        plateNorm: `P5${tag}`.toLowerCase(),
        brand: 'X',
      },
    });
    ids.vehicleIds.push(vehicle.id);

    const wo = await workOrders.create(
      intActor(actorId),
      { description: `OT inventario ${tag}`, vehicleId: vehicle.id },
      {},
    );
    ids.workOrderIds.push(wo.id);

    const line = await workOrderLines.create(
      wo.id,
      intActor(actorId),
      {
        lineType: WorkOrderLineType.PART,
        inventoryItemId: item.id,
        quantity: '3',
        unitPrice: '15',
      },
      {},
    );
    expect(line.lineType).toBe(WorkOrderLineType.PART);

    const stockMid = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(stockMid.quantityOnHand.toString()).toBe('4');

    const one = await workOrders.findOne(wo.id, intActor(actorId));
    expect(one.lines.length).toBeGreaterThanOrEqual(1);
    expect(one.linesSubtotal).toBe('45');

    await workOrderLines.remove(wo.id, line.id, intActor(actorId), {});

    const stockOut = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(stockOut.quantityOnHand.toString()).toBe('7');
  });

  it('recepción con costo total de línea (caneca) deriva c/u en techo COP', async () => {
    const tag = Date.now().toString(36).toUpperCase();
    const mu = await prisma.measurementUnit.findUnique({ where: { slug: 'gallon' } });
    if (!mu) {
      throw new Error('Falta unidad seed `gallon`');
    }

    const item = await inventoryItems.create(
      actorId,
      {
        sku: `INT-P5-CAN${tag}`,
        name: `Aceite caneca ${tag}`,
        measurementUnitSlug: 'gallon',
        initialQuantity: '0',
      },
      {},
    );
    ids.itemIds.push(item.id);

    const receipt = await purchaseReceipts.create(
      actorId,
      {
        note: OP_NOTE_STUB,
        paymentSource: 'BANK_TRANSFER',
        lines: [
          {
            inventoryItemId: item.id,
            quantity: '55',
            lineTotalCost: '2000000',
          },
        ],
      },
      {},
    );
    ids.receiptIds.push(receipt.id);

    const prLine = await prisma.purchaseReceiptLine.findFirst({
      where: { purchaseReceiptId: receipt.id },
    });
    expect(prLine?.lineTotalCost?.toString()).toBe('2000000');
    expect(prLine?.unitCost?.toString()).toBe('36364');

    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.quantityOnHand.toString()).toBe('55');
    expect(after.averageCost?.toString()).toBe('36364');
  });

  it('LABOR no mueve stock; OT cerrada no admite líneas nuevas', async () => {
    const tag = `L${Date.now()}`;
    const customer = await prisma.customer.create({
      data: { displayName: `P5L ${tag}`, primaryPhone: '3002222222' },
    });
    ids.customerIds.push(customer.id);
    const vehicle = await prisma.vehicle.create({
      data: {
        customerId: customer.id,
        plate: `P5L-${tag}`,
        plateNorm: `p5l-${tag}`.toLowerCase(),
        brand: 'Y',
      },
    });
    ids.vehicleIds.push(vehicle.id);

    const wo = await workOrders.create(
      intActor(actorId),
      { description: `OT labor ${tag}`, vehicleId: vehicle.id },
      {},
    );
    ids.workOrderIds.push(wo.id);

    const labor = await workOrderLines.create(
      wo.id,
      intActor(actorId),
      {
        lineType: WorkOrderLineType.LABOR,
        description: 'Cambio de aceite mano de obra',
        quantity: '1',
        unitPrice: '80',
      },
      {},
    );
    expect(labor.lineType).toBe(WorkOrderLineType.LABOR);

    await expect(
      workOrderLines.create(
        wo.id,
        intActor(actorId),
        {
          lineType: WorkOrderLineType.LABOR,
          description: 'Segunda mano de obra no permitida',
          quantity: '1',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { status: WorkOrderStatus.DELIVERED, deliveredAt: new Date() },
    });

    await expect(
      workOrderLines.create(
        wo.id,
        intActor(actorId),
        {
          lineType: WorkOrderLineType.LABOR,
          description: 'Otra mano de obra',
          quantity: '1',
        },
        {},
      ),
    ).rejects.toThrow();

    await prisma.workOrderLine.deleteMany({ where: { workOrderId: wo.id } });
    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { status: WorkOrderStatus.RECEIVED, deliveredAt: null },
    });
  });

  it('no permite PART si el stock es insuficiente', async () => {
    const tag = `S${Date.now()}`;
    const item = await inventoryItems.create(
      actorId,
      {
        sku: `INT-P5-S-${tag}`,
        name: `Stock bajo ${tag}`,
        measurementUnitSlug: 'unit',
        initialQuantity: '1',
      },
      {},
    );
    ids.itemIds.push(item.id);

    const customer = await prisma.customer.create({
      data: { displayName: `P5S ${tag}`, primaryPhone: '3003333333' },
    });
    ids.customerIds.push(customer.id);
    const vehicle = await prisma.vehicle.create({
      data: {
        customerId: customer.id,
        plate: `P5S-${tag}`,
        plateNorm: `p5s-${tag}`.toLowerCase(),
        brand: 'Z',
      },
    });
    ids.vehicleIds.push(vehicle.id);

    const wo = await workOrders.create(
      intActor(actorId),
      { description: `OT stock ${tag}`, vehicleId: vehicle.id },
      {},
    );
    ids.workOrderIds.push(wo.id);

    await expect(
      workOrderLines.create(
        wo.id,
        intActor(actorId),
        {
          lineType: WorkOrderLineType.PART,
          inventoryItemId: item.id,
          quantity: '2',
        },
        {},
      ),
    ).rejects.toThrow();
  });

  it('PART con unidad unit rechaza cantidad decimal', async () => {
    const tag = `D${Date.now()}`
    const item = await inventoryItems.create(
      actorId,
      {
        sku: `INT-P5-DEC-${tag}`,
        name: `Pieza decimal ${tag}`,
        measurementUnitSlug: 'unit',
        initialQuantity: '10',
      },
      {},
    )
    ids.itemIds.push(item.id)

    const customer = await prisma.customer.create({
      data: { displayName: `P5D ${tag}`, primaryPhone: '3004444444' },
    })
    ids.customerIds.push(customer.id)
    const vehicle = await prisma.vehicle.create({
      data: {
        customerId: customer.id,
        plate: `P5D-${tag}`,
        plateNorm: `p5d-${tag}`.toLowerCase(),
        brand: 'D',
      },
    })
    ids.vehicleIds.push(vehicle.id)

    const wo = await workOrders.create(
      intActor(actorId),
      { description: `OT decimal ${tag}`, vehicleId: vehicle.id },
      {},
    )
    ids.workOrderIds.push(wo.id)

    await expect(
      workOrderLines.create(
        wo.id,
        intActor(actorId),
        {
          lineType: WorkOrderLineType.PART,
          inventoryItemId: item.id,
          quantity: '0.25',
        },
        {},
      ),
    ).rejects.toThrow(/unidad entera/i)
  })

  it('PART con unidad gallon admite cantidad decimal', async () => {
    const tag = `G${Date.now()}`
    const item = await inventoryItems.create(
      actorId,
      {
        sku: `INT-P5-GAL-${tag}`,
        name: `Fluido ${tag}`,
        measurementUnitSlug: 'gallon',
        initialQuantity: '4',
      },
      {},
    )
    ids.itemIds.push(item.id)

    const customer = await prisma.customer.create({
      data: { displayName: `P5G ${tag}`, primaryPhone: '3005555555' },
    })
    ids.customerIds.push(customer.id)
    const vehicle = await prisma.vehicle.create({
      data: {
        customerId: customer.id,
        plate: `P5G-${tag}`,
        plateNorm: `p5g-${tag}`.toLowerCase(),
        brand: 'G',
      },
    })
    ids.vehicleIds.push(vehicle.id)

    const wo = await workOrders.create(
      intActor(actorId),
      { description: `OT galón ${tag}`, vehicleId: vehicle.id },
      {},
    )
    ids.workOrderIds.push(wo.id)

    const line = await workOrderLines.create(
      wo.id,
      intActor(actorId),
      {
        lineType: WorkOrderLineType.PART,
        inventoryItemId: item.id,
        quantity: '0.25',
      },
      {},
    )
    expect(line.quantity.toString()).toBe('0.25')

    const stockAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(stockAfter.quantityOnHand.toString()).toBe('3.75')
  })

  it('PART aceite en galón: en OT 1 = ¼ gal; stock y línea en galones', async () => {
    const tag = `O${Date.now()}`
    const item = await inventoryItems.create(
      actorId,
      {
        sku: `INT-P5-OIL-${tag}`,
        name: `Aceite semisintético ${tag}`,
        measurementUnitSlug: 'gallon',
        initialQuantity: '1',
      },
      {},
    )
    ids.itemIds.push(item.id)

    const customer = await prisma.customer.create({
      data: { displayName: `P5O ${tag}`, primaryPhone: '3006666666' },
    })
    ids.customerIds.push(customer.id)
    const vehicle = await prisma.vehicle.create({
      data: {
        customerId: customer.id,
        plate: `P5O-${tag}`,
        plateNorm: `p5o-${tag}`.toLowerCase(),
        brand: 'O',
      },
    })
    ids.vehicleIds.push(vehicle.id)

    const wo = await workOrders.create(
      intActor(actorId),
      { description: `OT aceite ${tag}`, vehicleId: vehicle.id },
      {},
    )
    ids.workOrderIds.push(wo.id)

    const line = await workOrderLines.create(
      wo.id,
      intActor(actorId),
      {
        lineType: WorkOrderLineType.PART,
        inventoryItemId: item.id,
        quantity: '1',
      },
      {},
    )
    expect(line.quantity.toString()).toBe('0.25')

    const stockAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(stockAfter.quantityOnHand.toString()).toBe('0.75')
  })

  it('PART aceite en galón rechaza decimales en la cantidad de OT (usar enteros de ¼)', async () => {
    const tag = `Q${Date.now()}`
    const item = await inventoryItems.create(
      actorId,
      {
        sku: `INT-P5-OILDEC-${tag}`,
        name: `Lubricante ${tag}`,
        measurementUnitSlug: 'gallon',
        initialQuantity: '2',
      },
      {},
    )
    ids.itemIds.push(item.id)

    const customer = await prisma.customer.create({
      data: { displayName: `P5Q ${tag}`, primaryPhone: '3007777777' },
    })
    ids.customerIds.push(customer.id)
    const vehicle = await prisma.vehicle.create({
      data: {
        customerId: customer.id,
        plate: `P5Q-${tag}`,
        plateNorm: `p5q-${tag}`.toLowerCase(),
        brand: 'Q',
      },
    })
    ids.vehicleIds.push(vehicle.id)

    const wo = await workOrders.create(
      intActor(actorId),
      { description: `OT aceite dec ${tag}`, vehicleId: vehicle.id },
      {},
    )
    ids.workOrderIds.push(wo.id)

    await expect(
      workOrderLines.create(
        wo.id,
        intActor(actorId),
        {
          lineType: WorkOrderLineType.PART,
          inventoryItemId: item.id,
          quantity: '0.25',
        },
        {},
      ),
    ).rejects.toThrow(/enteros/i)
  })
});
