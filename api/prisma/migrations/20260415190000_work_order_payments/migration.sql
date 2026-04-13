-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN "authorized_amount" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "work_order_payments" (
    "id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "cash_movement_id" TEXT NOT NULL,
    "note" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_order_payments_cash_movement_id_key" ON "work_order_payments"("cash_movement_id");

-- CreateIndex
CREATE INDEX "work_order_payments_work_order_id_created_at_idx" ON "work_order_payments"("work_order_id", "created_at");

-- AddForeignKey
ALTER TABLE "work_order_payments" ADD CONSTRAINT "work_order_payments_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_payments" ADD CONSTRAINT "work_order_payments_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_payments" ADD CONSTRAINT "work_order_payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
