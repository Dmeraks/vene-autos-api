-- Paso 2: default de nuevas OT = sin asignar
ALTER TABLE "work_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "work_orders" ALTER COLUMN "status" SET DEFAULT 'UNASSIGNED'::"WorkOrderStatus";
