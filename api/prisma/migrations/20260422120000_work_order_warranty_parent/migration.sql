-- OT de garantía / seguimiento vinculada a una OT origen (típ. ya entregada).
ALTER TABLE "work_orders" ADD COLUMN "parent_work_order_id" TEXT;

CREATE INDEX "work_orders_parent_work_order_id_idx" ON "work_orders"("parent_work_order_id");

ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_parent_work_order_id_fkey" FOREIGN KEY ("parent_work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
