-- Fase 5 · InvoicePayment: un pago en caja queda 1:1 con un CashMovement.
-- Permite cobrar facturas (desde OT entregada o desde Sale) directamente en caja
-- sin pasar por SalePayment o WorkOrderPayment.
--
-- Notas:
--  - `cashMovementId` es @unique (1:1) para evitar duplicar ingresos.
--  - Mismo patrón que SalePayment / WorkOrderPayment.

CREATE TYPE "InvoicePaymentKind" AS ENUM ('PARTIAL', 'FULL_SETTLEMENT');

CREATE TABLE "invoice_payments" (
  "id"               TEXT NOT NULL,
  "invoice_id"       TEXT NOT NULL,
  "amount"           DECIMAL(18,2) NOT NULL,
  "kind"             "InvoicePaymentKind" NOT NULL DEFAULT 'PARTIAL',
  "cash_movement_id" TEXT NOT NULL,
  "note"             TEXT,
  "recorded_by_id"   TEXT NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoice_payments_cash_movement_id_key" ON "invoice_payments"("cash_movement_id");
CREATE INDEX "invoice_payments_invoice_id_created_at_idx" ON "invoice_payments"("invoice_id", "created_at");

ALTER TABLE "invoice_payments"
  ADD CONSTRAINT "invoice_payments_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_payments"
  ADD CONSTRAINT "invoice_payments_cash_movement_id_fkey"
  FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_payments"
  ADD CONSTRAINT "invoice_payments_recorded_by_id_fkey"
  FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
