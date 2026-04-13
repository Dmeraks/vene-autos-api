-- CreateEnum
CREATE TYPE "WorkOrderLineType" AS ENUM ('PART', 'LABOR');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM (
    'PURCHASE_IN',
    'WORK_ORDER_CONSUMPTION',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT'
);

-- CreateTable
CREATE TABLE "measurement_units" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "measurement_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "sku" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "measurement_unit_id" TEXT NOT NULL,
    "quantity_on_hand" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "average_cost" DECIMAL(18,2),
    "track_stock" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "supplier_ref" VARCHAR(200),
    "received_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_lines" (
    "id" TEXT NOT NULL,
    "purchase_receipt_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_cost" DECIMAL(18,2),

    CONSTRAINT "purchase_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "quantity_change" DECIMAL(18,4) NOT NULL,
    "movement_type" "InventoryMovementType" NOT NULL,
    "reference_type" VARCHAR(80),
    "reference_id" VARCHAR(40),
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_lines" (
    "id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "line_type" "WorkOrderLineType" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "inventory_item_id" TEXT,
    "description" VARCHAR(2000),
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "measurement_units_slug_key" ON "measurement_units"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_sku_key" ON "inventory_items"("sku");

-- CreateIndex
CREATE INDEX "inventory_items_measurement_unit_id_idx" ON "inventory_items"("measurement_unit_id");

-- CreateIndex
CREATE INDEX "purchase_receipt_lines_purchase_receipt_id_idx" ON "purchase_receipt_lines"("purchase_receipt_id");

-- CreateIndex
CREATE INDEX "purchase_receipt_lines_inventory_item_id_idx" ON "purchase_receipt_lines"("inventory_item_id");

-- CreateIndex
CREATE INDEX "inventory_movements_inventory_item_id_created_at_idx" ON "inventory_movements"("inventory_item_id", "created_at");

-- CreateIndex
CREATE INDEX "work_order_lines_work_order_id_sort_order_idx" ON "work_order_lines"("work_order_id", "sort_order");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_measurement_unit_id_fkey" FOREIGN KEY ("measurement_unit_id") REFERENCES "measurement_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_purchase_receipt_id_fkey" FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_lines" ADD CONSTRAINT "work_order_lines_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_lines" ADD CONSTRAINT "work_order_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
