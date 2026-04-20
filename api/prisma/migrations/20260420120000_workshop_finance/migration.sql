-- Reservas teóricas (cierre caja) y deudas del taller

CREATE TABLE "workshop_reserve_lines" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workshop_reserve_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cash_session_reserve_contributions" (
    "id" TEXT NOT NULL,
    "cash_session_id" TEXT NOT NULL,
    "reserve_line_id" TEXT NOT NULL,
    "base_cash_counted" DECIMAL(18,2) NOT NULL,
    "percent_applied" DECIMAL(5,2) NOT NULL,
    "contribution_amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_session_reserve_contributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cash_session_reserve_contributions_cash_session_id_reserve_line_id_key" ON "cash_session_reserve_contributions"("cash_session_id", "reserve_line_id");
CREATE INDEX "cash_session_reserve_contributions_reserve_line_id_created_at_idx" ON "cash_session_reserve_contributions"("reserve_line_id", "created_at");

CREATE TYPE "WorkshopPayableStatus" AS ENUM ('OPEN', 'SETTLED');

CREATE TABLE "workshop_payables" (
    "id" TEXT NOT NULL,
    "creditor_name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "initial_amount" DECIMAL(18,2) NOT NULL,
    "balance_amount" DECIMAL(18,2) NOT NULL,
    "status" "WorkshopPayableStatus" NOT NULL DEFAULT 'OPEN',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workshop_payables_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workshop_payables_status_created_at_idx" ON "workshop_payables"("status", "created_at");

CREATE TYPE "WorkshopPayablePaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'OTHER');

CREATE TABLE "workshop_payable_payments" (
    "id" TEXT NOT NULL,
    "payable_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "WorkshopPayablePaymentMethod" NOT NULL,
    "cash_movement_id" TEXT,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workshop_payable_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workshop_payable_payments_cash_movement_id_key" ON "workshop_payable_payments"("cash_movement_id");
CREATE INDEX "workshop_payable_payments_payable_id_created_at_idx" ON "workshop_payable_payments"("payable_id", "created_at");

ALTER TABLE "cash_session_reserve_contributions" ADD CONSTRAINT "cash_session_reserve_contributions_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_session_reserve_contributions" ADD CONSTRAINT "cash_session_reserve_contributions_reserve_line_id_fkey" FOREIGN KEY ("reserve_line_id") REFERENCES "workshop_reserve_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workshop_payables" ADD CONSTRAINT "workshop_payables_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workshop_payable_payments" ADD CONSTRAINT "workshop_payable_payments_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "workshop_payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workshop_payable_payments" ADD CONSTRAINT "workshop_payable_payments_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workshop_payable_payments" ADD CONSTRAINT "workshop_payable_payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
