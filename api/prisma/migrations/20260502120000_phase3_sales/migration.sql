-- Fase 3 (POS / Ventas): módulo aditivo.
--   * Ventas de mostrador (origen COUNTER) consumen inventario al confirmar.
--   * Ventas originadas de una OT entregada (origen WORK_ORDER) NO reconsumen stock
--     (la OT ya descontó); solo registran el cobro/facturación.
--   * Impuestos por línea con snapshot del porcentaje (igual que WorkOrderLine).
--   * `SaleStatus` explícito para trazabilidad: borrador → confirmada → (cancelada/pagada).
-- Sin cambios en tablas existentes más allá de:
--   * Nuevo valor `SALE_CONSUMPTION` en `InventoryMovementType`.

CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

CREATE TYPE "SaleOrigin" AS ENUM ('COUNTER', 'WORK_ORDER');

CREATE TYPE "SaleLineType" AS ENUM ('PART', 'LABOR');

CREATE TYPE "SalePaymentKind" AS ENUM ('PARTIAL', 'FULL_SETTLEMENT');

ALTER TYPE "InventoryMovementType" ADD VALUE 'SALE_CONSUMPTION';

-- =============================================================================
-- SALES
-- =============================================================================

CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "sale_number" SERIAL NOT NULL,
    "public_code" VARCHAR(32) NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "origin" "SaleOrigin" NOT NULL DEFAULT 'COUNTER',
    -- Si la venta nace de una OT entregada, guardamos su id y marcamos el origen.
    -- Onto esta fila se NO reconsume inventario al agregar líneas PART.
    "origin_work_order_id" TEXT,
    "customer_id" TEXT,
    -- Snapshots del cliente al momento de emitir (para imprimir comprobante / factura DIAN).
    "customer_name"       VARCHAR(200),
    "customer_document_id" VARCHAR(40),
    "customer_phone"      VARCHAR(40),
    "customer_email"      VARCHAR(120),
    "internal_notes"      TEXT,
    "confirmed_at"        TIMESTAMP(3),
    "cancelled_at"        TIMESTAMP(3),
    "cancelled_reason"    TEXT,
    "created_by_id"       TEXT NOT NULL,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_sale_number_key" ON "sales"("sale_number");
CREATE UNIQUE INDEX "sales_public_code_key" ON "sales"("public_code");
CREATE UNIQUE INDEX "sales_origin_work_order_id_key" ON "sales"("origin_work_order_id");
CREATE INDEX "sales_status_created_at_idx" ON "sales"("status", "created_at");
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");
CREATE INDEX "sales_created_by_id_idx" ON "sales"("created_by_id");

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_origin_work_order_id_fkey"
  FOREIGN KEY ("origin_work_order_id") REFERENCES "work_orders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- SALE LINES
-- =============================================================================

CREATE TABLE "sale_lines" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "line_type" "SaleLineType" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "inventory_item_id" TEXT,
    "service_id" TEXT,
    "tax_rate_id" TEXT,
    "description" VARCHAR(2000),
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,2),
    "discount_amount" DECIMAL(18,2),
    "cost_snapshot" DECIMAL(18,2),
    "tax_rate_percent_snapshot" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sale_lines_sale_id_sort_order_idx" ON "sale_lines"("sale_id", "sort_order");
CREATE INDEX "sale_lines_inventory_item_id_idx" ON "sale_lines"("inventory_item_id");
CREATE INDEX "sale_lines_service_id_idx" ON "sale_lines"("service_id");
CREATE INDEX "sale_lines_tax_rate_id_idx" ON "sale_lines"("tax_rate_id");

ALTER TABLE "sale_lines"
  ADD CONSTRAINT "sale_lines_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_lines"
  ADD CONSTRAINT "sale_lines_inventory_item_id_fkey"
  FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_lines"
  ADD CONSTRAINT "sale_lines_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_lines"
  ADD CONSTRAINT "sale_lines_tax_rate_id_fkey"
  FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- SALE PAYMENTS
-- =============================================================================

CREATE TABLE "sale_payments" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "kind" "SalePaymentKind" NOT NULL DEFAULT 'PARTIAL',
    "cash_movement_id" TEXT NOT NULL,
    "note" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_payments_cash_movement_id_key" ON "sale_payments"("cash_movement_id");
CREATE INDEX "sale_payments_sale_id_created_at_idx" ON "sale_payments"("sale_id", "created_at");

ALTER TABLE "sale_payments"
  ADD CONSTRAINT "sale_payments_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_payments"
  ADD CONSTRAINT "sale_payments_cash_movement_id_fkey"
  FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_payments"
  ADD CONSTRAINT "sale_payments_recorded_by_id_fkey"
  FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
