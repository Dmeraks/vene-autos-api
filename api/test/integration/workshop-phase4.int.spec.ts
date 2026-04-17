/**
 * Integración real con PostgreSQL (`DATABASE_URL`).
 * Ejecutar con: `npm run test:integration` (CI aplica migraciones + seed sobre la BD de test).
 */
import { WorkOrderStatus } from '@prisma/client';
import type { NotesPolicyService } from '../../src/common/notes-policy/notes-policy.service';
import type { JwtUserPayload } from '../../src/modules/auth/types/jwt-user.payload';
import { CustomersService } from '../../src/modules/customers/customers.service';
import { VehiclesService } from '../../src/modules/vehicles/vehicles.service';
import { WorkOrdersService } from '../../src/modules/work-orders/work-orders.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Workshop phase 4 (integración)', () => {
  let prisma: PrismaService;
  let actorId: string;
  const audit = { recordDomain: jest.fn().mockResolvedValue(undefined) };
  const notesStub = {
    requireOperationalNote: async (_label: string, raw: string | null | undefined) => (raw ?? '').trim(),
  } as unknown as NotesPolicyService;
  let customers: CustomersService;
  let vehicles: VehiclesService;
  let workOrders: WorkOrdersService;

  function intActor(sub: string): JwtUserPayload {
    return {
      sub,
      sid: 'integration',
      email: 'int@test',
      fullName: 'Integration',
      permissions: ['work_orders:read', 'work_orders:create', 'work_orders:update'],
    };
  }

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

    workOrders = new WorkOrdersService(prisma, audit as never, notesStub);
    customers = new CustomersService(prisma, audit as never);
    vehicles = new VehiclesService(prisma, audit as never, workOrders);
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
      intActor(actorId),
      {
        description: `INTEG servicio ${tag} xxx`.slice(0, 4000),
        vehicleId: vehicle.id,
      },
      {},
    );
    ids.workOrderIds.push(wo.id);

    expect(wo.vehicleId).toBe(vehicle.id);
    expect(wo.customerName).toContain('Cliente');
    expect(wo.vehicleBrand).toBe('TestBrand');

    const listed = await workOrders.list(intActor(actorId), { vehicleId: vehicle.id });
    expect(listed.items.some((r) => r.id === wo.id)).toBe(true);

    const byCustomer = await workOrders.list(intActor(actorId), { customerId: customer.id });
    expect(byCustomer.items.some((r) => r.id === wo.id)).toBe(true);

    const one = await workOrders.findOne(wo.id, intActor(actorId));
    expect(one.vehicle?.id).toBe(vehicle.id);
    expect(one.paymentSummary.paymentCount).toBe(0);
    expect(one.linesSubtotal).toBeDefined();
    expect(Array.isArray(one.lines)).toBe(true);
  });

  it('OT: correo y modelo se copian del maestro al crear; PATCH los actualiza', async () => {
    const tag = `EM${Date.now().toString(36)}`;
    const customer = await customers.create(
      actorId,
      { displayName: `Cliente mail ${tag}`, email: `${tag}@factura.test`, primaryPhone: '3111111111' },
      {},
    );
    ids.customerIds.push(customer.id);

    const vehicle = await vehicles.create(
      actorId,
      { customerId: customer.id, plate: `EM-${tag}`, brand: 'MarcaM', model: 'ModeloM' },
      {},
    );
    ids.vehicleIds.push(vehicle.id);

    const wo = await workOrders.create(
      intActor(actorId),
      { description: `OT mail/modelo ${tag} xxx`.slice(0, 4000), vehicleId: vehicle.id },
      {},
    );
    ids.workOrderIds.push(wo.id);

    expect(wo.customerEmail).toBe(`${tag}@factura.test`.toLowerCase());
    expect(wo.vehicleModel).toBe('ModeloM');

    const patched = await workOrders.update(
      wo.id,
      intActor(actorId),
      {
        customerEmail: 'actualizado@factura.test',
        vehicleModel: 'Otro modelo',
        customerName: 'Razón social OT',
      },
      {},
    );
    expect(patched.customerEmail).toBe('actualizado@factura.test');
    expect(patched.vehicleModel).toBe('Otro modelo');
    expect(patched.customerName).toBe('Razón social OT');
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
    const wo = await workOrders.create(intActor(actorId), { description: 'x'.repeat(5), vehicleId: v.id }, {});
    ids.workOrderIds.push(wo.id);

    await prisma.workOrder.update({
      where: { id: wo.id },
      data: {
        status: WorkOrderStatus.DELIVERED,
        deliveredAt: new Date(),
      },
    });

    await expect(
      workOrders.update(wo.id, intActor(actorId), { description: 'Otro texto largo suficiente' }, {}),
    ).rejects.toThrow();
  });

  it('no permite pasar a Recibida sin técnico asignado en el mismo guardado', async () => {
    const tag = `RS${Date.now()}`;
    const c = await customers.create(actorId, { displayName: `C ${tag}` }, {});
    ids.customerIds.push(c.id);
    const v = await vehicles.create(actorId, { customerId: c.id, plate: `${tag}AA` }, {});
    ids.vehicleIds.push(v.id);
    const wo = await workOrders.create(intActor(actorId), { description: 'x'.repeat(50), vehicleId: v.id }, {});
    ids.workOrderIds.push(wo.id);

    await expect(
      workOrders.update(wo.id, intActor(actorId), { status: WorkOrderStatus.RECEIVED }, {}),
    ).rejects.toThrow(/asign/i);
  });

  it('asignación a sí mismo + Recibida → En taller (transiciones válidas)', async () => {
    const tag = `ST${Date.now()}`;
    const c = await customers.create(actorId, { displayName: `C ${tag}` }, {});
    ids.customerIds.push(c.id);
    const v = await vehicles.create(actorId, { customerId: c.id, plate: `${tag}BB` }, {});
    ids.vehicleIds.push(v.id);
    const wo = await workOrders.create(intActor(actorId), { description: 'y'.repeat(50), vehicleId: v.id }, {});
    ids.workOrderIds.push(wo.id);

    expect(wo.status).toBe(WorkOrderStatus.UNASSIGNED);

    const step1 = await workOrders.update(
      wo.id,
      intActor(actorId),
      { assignedToId: actorId, status: WorkOrderStatus.RECEIVED },
      {},
    );
    expect(step1.status).toBe(WorkOrderStatus.RECEIVED);
    expect(step1.assignedToId).toBe(actorId);

    const step2 = await workOrders.update(wo.id, intActor(actorId), { status: WorkOrderStatus.IN_WORKSHOP }, {});
    expect(step2.status).toBe(WorkOrderStatus.IN_WORKSHOP);

    const one = await workOrders.findOne(wo.id, intActor(actorId));
    expect(one.status).toBe(WorkOrderStatus.IN_WORKSHOP);
  });

  it('rechaza transición de estado no permitida (Sin asignar → Lista)', async () => {
    const tag = `TR${Date.now()}`;
    const c = await customers.create(actorId, { displayName: `C ${tag}` }, {});
    ids.customerIds.push(c.id);
    const v = await vehicles.create(actorId, { customerId: c.id, plate: `${tag}CC` }, {});
    ids.vehicleIds.push(v.id);
    const wo = await workOrders.create(intActor(actorId), { description: 'z'.repeat(50), vehicleId: v.id }, {});
    ids.workOrderIds.push(wo.id);

    await expect(
      workOrders.update(wo.id, intActor(actorId), { status: WorkOrderStatus.READY }, {}),
    ).rejects.toThrow(/Transición de estado no permitida/i);
  });

  it('OT garantía: solo con origen Entregada; detalle expone padre e hijos', async () => {
    const tag = `WG${Date.now()}`;
    const c = await customers.create(actorId, { displayName: `WG ${tag}` }, {});
    ids.customerIds.push(c.id);
    const v = await vehicles.create(actorId, { customerId: c.id, plate: `${tag}WW` }, {});
    ids.vehicleIds.push(v.id);
    const parent = await workOrders.create(
      intActor(actorId),
      { description: 'w'.repeat(50), vehicleId: v.id },
      {},
    );
    ids.workOrderIds.push(parent.id);

    await prisma.workOrder.update({
      where: { id: parent.id },
      data: { status: WorkOrderStatus.DELIVERED, deliveredAt: new Date() },
    });

    const child = await workOrders.create(
      intActor(actorId),
      {
        description: 'Reclamo en garantía — seguimiento',
        vehicleId: v.id,
        parentWorkOrderId: parent.id,
      },
      {},
    );
    ids.workOrderIds.push(child.id);

    expect(child.parentWorkOrderId).toBe(parent.id);

    const detailChild = await workOrders.findOne(child.id, intActor(actorId));
    expect(detailChild.parentWorkOrder?.id).toBe(parent.id);
    expect(detailChild.parentWorkOrder?.orderNumber).toBe(parent.orderNumber);

    const detailParent = await workOrders.findOne(parent.id, intActor(actorId));
    expect(detailParent.warrantyFollowUpCount).toBe(1);
    expect(detailParent.warrantyFollowUps?.length).toBe(1);
    expect(detailParent.warrantyFollowUps?.[0]?.id).toBe(child.id);
  });

  it('OT garantía rechaza origen que no está Entregada', async () => {
    const tag = `WR${Date.now()}`;
    const c = await customers.create(actorId, { displayName: `WR ${tag}` }, {});
    ids.customerIds.push(c.id);
    const v = await vehicles.create(actorId, { customerId: c.id, plate: `${tag}RR` }, {});
    ids.vehicleIds.push(v.id);
    const parent = await workOrders.create(
      intActor(actorId),
      { description: 'q'.repeat(50), vehicleId: v.id },
      {},
    );
    ids.workOrderIds.push(parent.id);

    await prisma.workOrder.update({
      where: { id: parent.id },
      data: { status: WorkOrderStatus.READY },
    });

    await expect(
      workOrders.create(
        intActor(actorId),
        {
          description: 'Intento garantía',
          vehicleId: v.id,
          parentWorkOrderId: parent.id,
        },
        {},
      ),
    ).rejects.toThrow(/Entregad/i);
  });

  it('OT garantía no permite encadenar desde otra garantía', async () => {
    const tag = `WC${Date.now()}`;
    const c = await customers.create(actorId, { displayName: `WC ${tag}` }, {});
    ids.customerIds.push(c.id);
    const v = await vehicles.create(actorId, { customerId: c.id, plate: `${tag}CC` }, {});
    ids.vehicleIds.push(v.id);
    const root = await workOrders.create(
      intActor(actorId),
      { description: 'a'.repeat(50), vehicleId: v.id },
      {},
    );
    ids.workOrderIds.push(root.id);
    await prisma.workOrder.update({
      where: { id: root.id },
      data: { status: WorkOrderStatus.DELIVERED, deliveredAt: new Date() },
    });

    const child = await workOrders.create(
      intActor(actorId),
      { description: 'b'.repeat(50), vehicleId: v.id, parentWorkOrderId: root.id },
      {},
    );
    ids.workOrderIds.push(child.id);
    await prisma.workOrder.update({
      where: { id: child.id },
      data: { status: WorkOrderStatus.DELIVERED, deliveredAt: new Date() },
    });

    await expect(
      workOrders.create(
        intActor(actorId),
        { description: 'c'.repeat(50), vehicleId: v.id, parentWorkOrderId: child.id },
        {},
      ),
    ).rejects.toThrow(/encadenar/i);
  });
});
