-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('RECEIVED', 'IN_WORKSHOP', 'WAITING_PARTS', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "order_number" SERIAL NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "description" TEXT NOT NULL,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "vehicle_plate" TEXT,
    "vehicle_notes" TEXT,
    "internal_notes" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_order_number_key" ON "work_orders"("order_number");

-- CreateIndex
CREATE INDEX "work_orders_status_created_at_idx" ON "work_orders"("status", "created_at");

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
