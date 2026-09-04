/**
 * Borra todas las órdenes de trabajo y datos colgantes (líneas, pagos, movimientos de caja e inventario
 * referenciados por líneas OT). Restaura cantidad en inventario según líneas PART existentes.
 *
 * No modifica código ni esquema; solo datos.
 *
 * Uso (PowerShell):
 *   $env:PURGE_WORK_ORDERS_CONFIRM="YES"; npx ts-node --project tsconfig.scripts.json prisma/scripts/purge-all-work-orders.ts
 */
import { PrismaClient, WorkOrderLineType } from '@prisma/client';

const INVENTORY_REF_WORK_ORDER_LINE = 'WorkOrderLine';
const CASH_WORK_ORDER_REFERENCE_TYPE = 'WorkOrder';

async function main() {
  if (process.env.PURGE_WORK_ORDERS_CONFIRM !== 'YES') {
    console.error(
      'Refused: set PURGE_WORK_ORDERS_CONFIRM=YES to run (borra todas las OT, pagos asociados y restaura stock PART).',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const beforeWo = await prisma.workOrder.count();
    const beforeLines = await prisma.workOrderLine.count();
    const beforePay = await prisma.workOrderPayment.count();
    let partRestoreRows = 0;

    await prisma.$transaction(async (tx) => {
      await tx.workOrder.updateMany({ data: { parentWorkOrderId: null } });

      await tx.workOrderPayment.deleteMany({});

      await tx.cashMovement.deleteMany({
        where: { referenceType: CASH_WORK_ORDER_REFERENCE_TYPE },
      });

      const partAgg = await tx.workOrderLine.groupBy({
        by: ['inventoryItemId'],
        where: {
          lineType: WorkOrderLineType.PART,
          inventoryItemId: { not: null },
        },
        _sum: { quantity: true },
      });

      partRestoreRows = partAgg.length;
      for (const row of partAgg) {
        if (!row.inventoryItemId) continue;
        const add = row._sum.quantity;
        if (!add || add.eq(0)) continue;
        await tx.inventoryItem.update({
          where: { id: row.inventoryItemId },
          data: { quantityOnHand: { increment: add } },
        });
      }

      await tx.inventoryMovement.deleteMany({
        where: { referenceType: INVENTORY_REF_WORK_ORDER_LINE },
      });

      await tx.workOrderLine.deleteMany({});
      await tx.workOrder.deleteMany({});

      await tx.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('work_orders', 'order_number'),
          1,
          false
        )
      `);
    });

    console.log('Done.', {
      deletedWorkOrders: beforeWo,
      deletedLines: beforeLines,
      deletedPayments: beforePay,
      partSkusRestored: partRestoreRows,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
