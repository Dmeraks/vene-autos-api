/**
 * Inventario y líneas de OT (Fase 5). Requiere migraciones aplicadas y seed (unidades de medida).
 */
import { WorkOrderLineType, WorkOrderStatus } from '@prisma/client';
import { InventoryItemsService } from '../../src/modules/inventory/inventory-items.service';
import { PurchaseReceiptsService } from '../../src/modules/inventory/purchase-receipts.service';
import { WorkOrderLinesService } from '../../src/modules/work-orders/work-order-lines.service';
import { WorkOrdersService } from '../../src/modules/work-orders/work-orders.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Workshop phase 5 (integración)', () => {
  let prisma: PrismaService;
  let actorId: string;
  const audit = { recordDomain: jest.fn().mockResolvedValue(undefined) };
  let workOrders: WorkOrdersService;
  let workOrderLines: WorkOrderLinesService;
  let inventoryItems: InventoryItemsService;
  let purchaseReceipts: PurchaseReceiptsService;

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

    const user = await prisma.user.findFirst({ where: { isActive: true } });
    if (!user) {
      throw new Error('Se esperaba al menos un usuario activo (ejecutá prisma db seed)');
    }
    actorId = user.id;

    workOrders = new WorkOrdersService(prisma, audit as never);
    workOrderLines = new WorkOrderLinesService(prisma, audit as never);
    inventoryItems = new InventoryItemsService(prisma, audit as never);
    purchaseReceipts = new PurchaseReceiptsService(prisma, audit as never);
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
        lines: [{ inventoryItemId: item.id, quantity: '5', unitCost: '10.00' }],
      },
      {},
    );
    ids.receiptIds.push(receipt.id);

    const afterIn = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(afterIn.quantityOnHand.toString()).toBe('7');

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
      actorId,
      { description: `OT inventario ${tag}`, vehicleId: vehicle.id },
      {},
    );
    ids.workOrderIds.push(wo.id);

    const line = await workOrderLines.create(
      wo.id,
      actorId,
      {
        lineType: WorkOrderLineType.PART,
        inventoryItemId: item.id,
        quantity: '3',
        unitPrice: '15.00',
      },
      {},
    );
    expect(line.lineType).toBe(WorkOrderLineType.PART);

    const stockMid = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(stockMid.quantityOnHand.toString()).toBe('4');

    const one = await workOrders.findOne(wo.id);
    expect(one.lines.length).toBeGreaterThanOrEqual(1);
    expect(one.linesSubtotal).toBe('45.00');

    await workOrderLines.remove(wo.id, line.id, actorId, {});

    const stockOut = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(stockOut.quantityOnHand.toString()).toBe('7');
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
      actorId,
      { description: `OT labor ${tag}`, vehicleId: vehicle.id },
      {},
    );
    ids.workOrderIds.push(wo.id);

    const labor = await workOrderLines.create(
      wo.id,
      actorId,
      {
        lineType: WorkOrderLineType.LABOR,
        description: 'Cambio de aceite mano de obra',
        quantity: '1',
        unitPrice: '80.00',
      },
      {},
    );
    expect(labor.lineType).toBe(WorkOrderLineType.LABOR);

    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { status: WorkOrderStatus.DELIVERED, deliveredAt: new Date() },
    });

    await expect(
      workOrderLines.create(
        wo.id,
        actorId,
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
      actorId,
      { description: `OT stock ${tag}`, vehicleId: vehicle.id },
      {},
    );
    ids.workOrderIds.push(wo.id);

    await expect(
      workOrderLines.create(
        wo.id,
        actorId,
        {
          lineType: WorkOrderLineType.PART,
          inventoryItemId: item.id,
          quantity: '2',
        },
        {},
      ),
    ).rejects.toThrow();
  });
});
