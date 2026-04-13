/**
 * Integración real con PostgreSQL (`DATABASE_URL`).
 * Ejecutar con: `npm run test:integration` (CI aplica migraciones + seed sobre la BD de test).
 */
import { WorkOrderStatus } from '@prisma/client';
import { CustomersService } from '../../src/modules/customers/customers.service';
import { VehiclesService } from '../../src/modules/vehicles/vehicles.service';
import { WorkOrdersService } from '../../src/modules/work-orders/work-orders.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Workshop phase 4 (integración)', () => {
  let prisma: PrismaService;
  let actorId: string;
  const audit = { recordDomain: jest.fn().mockResolvedValue(undefined) };
  let customers: CustomersService;
  let vehicles: VehiclesService;
  let workOrders: WorkOrdersService;

  const ids: { customerIds: string[]; vehicleIds: string[]; workOrderIds: string[] } = {
    customerIds: [],
    vehicleIds: [],
    workOrderIds: [],
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

    customers = new CustomersService(prisma, audit as never);
    vehicles = new VehiclesService(prisma, audit as never);
    workOrders = new WorkOrdersService(prisma, audit as never);
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
    await prisma.$disconnect();
  });

  it('cliente → vehículo → OT enlazada → listado por vehicleId', async () => {
    const tag = Date.now().toString(36).toUpperCase();

    const customer = await customers.create(
      actorId,
      { displayName: `Cliente int ${tag}`, primaryPhone: '3000000000' },
      {},
    );
    ids.customerIds.push(customer.id);

    const vehicle = await vehicles.create(
      actorId,
      {
        customerId: customer.id,
        plate: `ZZ-${tag}`,
        brand: 'TestBrand',
      },
      {},
    );
    ids.vehicleIds.push(vehicle.id);

    const wo = await workOrders.create(
      actorId,
      {
        description: `INTEG servicio ${tag} xxx`.slice(0, 4000),
        vehicleId: vehicle.id,
      },
      {},
    );
    ids.workOrderIds.push(wo.id);

    expect(wo.vehicleId).toBe(vehicle.id);
    expect(wo.customerName).toContain('Cliente');

    const listed = await workOrders.list(actorId, { vehicleId: vehicle.id });
    expect(listed.some((r) => r.id === wo.id)).toBe(true);

    const one = await workOrders.findOne(wo.id);
    expect(one.vehicle?.id).toBe(vehicle.id);
    expect(one.paymentSummary.paymentCount).toBe(0);
    expect(one.linesSubtotal).toBeDefined();
    expect(Array.isArray(one.lines)).toBe(true);
  });

  it('placa normalizada única: segundo vehículo mismo plateNorm falla', async () => {
    const tag = `DUP${Date.now()}`;
    const customer = await customers.create(actorId, { displayName: `Dup ${tag}` }, {});
    ids.customerIds.push(customer.id);

    const v1 = await vehicles.create(actorId, { customerId: customer.id, plate: `${tag}AB` }, {});
    ids.vehicleIds.push(v1.id);

    await expect(
      vehicles.create(actorId, { customerId: customer.id, plate: `${tag} A B` }, {}),
    ).rejects.toThrow();

    await prisma.vehicle.delete({ where: { id: v1.id } });
    ids.vehicleIds.pop();
    await prisma.customer.delete({ where: { id: customer.id } });
    ids.customerIds.pop();
  });

  it('no permite actualizar OT en estado DELIVERED', async () => {
    const tag = `CL${Date.now()}`;
    const c = await customers.create(actorId, { displayName: `C ${tag}` }, {});
    ids.customerIds.push(c.id);
    const v = await vehicles.create(actorId, { customerId: c.id, plate: `${tag}ZZ` }, {});
    ids.vehicleIds.push(v.id);
    const wo = await workOrders.create(actorId, { description: 'x'.repeat(5), vehicleId: v.id }, {});
    ids.workOrderIds.push(wo.id);

    await prisma.workOrder.update({
      where: { id: wo.id },
      data: {
        status: WorkOrderStatus.DELIVERED,
        deliveredAt: new Date(),
      },
    });

    await expect(
      workOrders.update(wo.id, actorId, { description: 'Otro texto largo suficiente' }, {}),
    ).rejects.toThrow();
  });
});
