/**
 * Una sola ejecución: agrupa OT legadas por placa normalizada, crea Cliente + Vehículo y enlaza `vehicle_id`.
 * Correr tras migración `20260416120000_customers_vehicles` y con BD de respaldo en producción.
 *
 *   cd api && npx prisma generate && npm run backfill:legacy-vehicles
 */
import { PrismaClient } from '@prisma/client';

function plateNorm(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

async function main() {
  const prisma = new PrismaClient();
  const wos = await prisma.workOrder.findMany({
    where: {
      vehicleId: null,
      vehiclePlate: { not: null },
    },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      customerPhone: true,
      vehiclePlate: true,
    },
  });

  const groups = new Map<
    string,
    { plateDisplay: string; wos: typeof wos }
  >();

  for (const wo of wos) {
    const raw = wo.vehiclePlate?.trim();
    if (!raw) {
      continue;
    }
    const key = plateNorm(raw);
    if (!key) {
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, { plateDisplay: raw, wos: [] });
    }
    groups.get(key)!.wos.push(wo);
  }

  // Orden estable: por número de OT
  for (const [, group] of groups) {
    group.wos.sort((a, b) => a.orderNumber - b.orderNumber);
  }

  let createdCustomers = 0;
  let createdVehicles = 0;
  let linkedOrders = 0;

  for (const [norm, group] of groups) {
    const first = group.wos[0];
    const displayName =
      first.customerName?.trim() || `Cliente histórico (placa ${group.plateDisplay})`;
    const customer = await prisma.customer.create({
      data: {
        displayName,
        primaryPhone: first.customerPhone?.trim() || null,
      },
    });
    createdCustomers += 1;

    const vehicle = await prisma.vehicle.create({
      data: {
        customerId: customer.id,
        plate: group.plateDisplay,
        plateNorm: norm,
      },
    });
    createdVehicles += 1;

    const ids = group.wos.map((w) => w.id);
    const res = await prisma.workOrder.updateMany({
      where: { id: { in: ids } },
      data: { vehicleId: vehicle.id },
    });
    linkedOrders += res.count;
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        groups: groups.size,
        createdCustomers,
        createdVehicles,
        linkedOrders,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
