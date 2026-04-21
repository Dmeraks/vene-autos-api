/**
 * Vacía inventario y todas las órdenes de trabajo.
 * Conserva usuarios, roles, permisos, clientes, vehículos, servicios, caja (salvo movimientos
 * usados solo por OT/venta-factura que se borran), resoluciones fiscales vacías de uso, etc.
 *
 * Elimina también:
 * - Ventas derivadas de OT (`origin_work_order_id`)
 * - Facturas ligadas a OT o a esas ventas (y NC/ND/pagos asociados)
 * - Corridas de nómina (`payroll_*`) porque referencian OT
 *
 * Uso (PowerShell):
 *   $env:WIPE_INV_WO_CONFIRM="YES"; npx ts-node --project tsconfig.scripts.json prisma/scripts/wipe-inventory-and-work-orders.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const CASH_REF_WORK_ORDER = 'WorkOrder';

async function main() {
  if (process.env.WIPE_INV_WO_CONFIRM?.trim() !== 'YES') {
    console.error('Refused: set WIPE_INV_WO_CONFIRM=YES');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const counts = await prisma.$transaction(
      async (tx) => {
        let deletedInvoices = 0;
        let deletedWoSales = 0;

        /** Nómina semanal (filas → OT). */
        await tx.payrollRunEntry.deleteMany({});
        await tx.payrollAdjustment.deleteMany({});
        await tx.payrollRun.deleteMany({});

        /** Ventas generadas desde OT (una por OT como máximo). */
        const woSales = await tx.sale.findMany({
          where: { originWorkOrderId: { not: null } },
          select: { id: true },
        });
        const woSaleIds = woSales.map((s) => s.id);
        deletedWoSales = woSaleIds.length;

        if (woSaleIds.length) {
          const salePayments = await tx.salePayment.findMany({
            where: { saleId: { in: woSaleIds } },
            select: { cashMovementId: true },
          });
          await tx.salePayment.deleteMany({ where: { saleId: { in: woSaleIds } } });
          if (salePayments.length) {
            await tx.cashMovement.deleteMany({
              where: { id: { in: salePayments.map((p) => p.cashMovementId) } },
            });
          }
          await tx.saleLine.deleteMany({ where: { saleId: { in: woSaleIds } } });
          await tx.sale.deleteMany({ where: { id: { in: woSaleIds } } });
        }

        /** Facturas ligadas a OT o a ventas desde OT (evita FK al borrar OT / inventario). */
        const invoiceWhere =
          woSaleIds.length ?
            {
              OR: [{ workOrderId: { not: null } }, { saleId: { in: woSaleIds } }],
            }
          : { workOrderId: { not: null } };

        const invToRemove = await tx.invoice.findMany({
          where: invoiceWhere,
          select: { id: true },
        });
        const invIds = invToRemove.map((i) => i.id);

        if (invIds.length) {
          const invPays = await tx.invoicePayment.findMany({
            where: { invoiceId: { in: invIds } },
            select: { cashMovementId: true },
          });
          await tx.invoicePayment.deleteMany({ where: { invoiceId: { in: invIds } } });
          if (invPays.length) {
            await tx.cashMovement.deleteMany({
              where: { id: { in: invPays.map((p) => p.cashMovementId) } },
            });
          }
          await tx.creditNote.deleteMany({ where: { invoiceId: { in: invIds } } });
          await tx.debitNote.deleteMany({ where: { invoiceId: { in: invIds } } });
          const invDel = await tx.invoice.deleteMany({ where: { id: { in: invIds } } });
          deletedInvoices = invDel.count;
        }

        /** Pagos OT → movimientos de caja */
        const woPays = await tx.workOrderPayment.findMany({
          select: { cashMovementId: true },
        });
        await tx.workOrderPayment.deleteMany({});
        if (woPays.length) {
          await tx.cashMovement.deleteMany({
            where: { id: { in: woPays.map((p) => p.cashMovementId) } },
          });
        }
        await tx.cashMovement.deleteMany({
          where: { referenceType: CASH_REF_WORK_ORDER },
        });

        /** Inventario: movimientos y compras */
        await tx.inventoryMovement.deleteMany({});
        await tx.purchaseReceiptLine.deleteMany({});
        await tx.purchaseReceipt.deleteMany({});

        /** OT */
        await tx.workOrder.updateMany({ data: { parentWorkOrderId: null } });
        await tx.workOrderLine.deleteMany({});
        const woDel = await tx.workOrder.deleteMany({});

        /** Ventas mostrador que aún apuntaban a ítems */
        await tx.saleLine.updateMany({
          where: { inventoryItemId: { not: null } },
          data: { inventoryItemId: null },
        });
        await tx.invoiceLine.updateMany({
          where: { inventoryItemId: { not: null } },
          data: { inventoryItemId: null },
        });

        const deletedItems = await tx.inventoryItem.deleteMany({});

        await tx.$executeRawUnsafe(`
          SELECT setval(
            pg_get_serial_sequence('work_orders', 'order_number'),
            1,
            false
          )
        `);

        return {
          deletedWorkOrders: woDel.count,
          deletedInventoryItems: deletedItems.count,
          deletedInvoices,
          deletedWoDerivedSales: deletedWoSales,
        };
      },
      { maxWait: 60_000, timeout: 120_000 },
    );

    console.log('OK.', counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
