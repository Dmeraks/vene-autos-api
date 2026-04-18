-- Fase 9 · Nómina técnica semanal.
-- Se paga los sábados por la mano de obra (línea LABOR) de las OTs entregadas
-- (status = DELIVERED) en la semana lunes→sábado. El % lo configura el dueño
-- por técnico (default 50%). Se persiste la corrida (PayrollRun) y su detalle
-- (PayrollRunEntry, PayrollAdjustment). El pago genera un CashMovement EXPENSE
-- con categoría "nomina_tecnicos" (seed) y queda congelada la corrida.

-- Enums -----------------------------------------------------------------------
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PAID', 'VOIDED');
CREATE TYPE "PayrollAdjustmentKind" AS ENUM ('BONUS', 'ADVANCE', 'DEDUCTION', 'OTHER');

-- Configuración por técnico (%) -----------------------------------------------
CREATE TABLE "technician_payroll_configs" (
  "id"                   TEXT           PRIMARY KEY,
  "user_id"              TEXT           NOT NULL,
  "labor_commission_pct" DECIMAL(5,2)   NOT NULL DEFAULT 50.00,
  "is_active"            BOOLEAN        NOT NULL DEFAULT TRUE,
  "notes"                TEXT,
  "created_at"           TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3)   NOT NULL,
  CONSTRAINT "technician_payroll_configs_user_id_key"
    UNIQUE ("user_id"),
  CONSTRAINT "technician_payroll_configs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Corrida semanal por técnico -------------------------------------------------
CREATE TABLE "payroll_runs" (
  "id"                      TEXT           PRIMARY KEY,
  "technician_id"           TEXT           NOT NULL,
  "week_start"              TIMESTAMP(3)   NOT NULL,
  "week_end"                TIMESTAMP(3)   NOT NULL,
  "status"                  "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
  "commission_pct_applied"  DECIMAL(5,2)   NOT NULL,
  "base_amount"             DECIMAL(18,2)  NOT NULL,
  "commission_amount"       DECIMAL(18,2)  NOT NULL,
  "adjustments_total"       DECIMAL(18,2)  NOT NULL DEFAULT 0,
  "total_to_pay"            DECIMAL(18,2)  NOT NULL,
  "paid_at"                 TIMESTAMP(3),
  "cash_movement_id"        TEXT,
  "notes"                   TEXT,
  "created_at"              TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3)   NOT NULL,
  CONSTRAINT "payroll_runs_technician_id_week_start_key"
    UNIQUE ("technician_id", "week_start"),
  CONSTRAINT "payroll_runs_cash_movement_id_key"
    UNIQUE ("cash_movement_id"),
  CONSTRAINT "payroll_runs_technician_id_fkey"
    FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_runs_cash_movement_id_fkey"
    FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "payroll_runs_week_start_week_end_idx" ON "payroll_runs"("week_start", "week_end");
CREATE INDEX "payroll_runs_status_idx"               ON "payroll_runs"("status");

-- Detalle por OT --------------------------------------------------------------
CREATE TABLE "payroll_run_entries" (
  "id"              TEXT           PRIMARY KEY,
  "payroll_run_id"  TEXT           NOT NULL,
  "work_order_id"   TEXT           NOT NULL,
  "labor_subtotal"  DECIMAL(18,2)  NOT NULL,
  "commission"      DECIMAL(18,2)  NOT NULL,
  "delivered_at"    TIMESTAMP(3)   NOT NULL,
  "created_at"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_run_entries_payroll_run_id_work_order_id_key"
    UNIQUE ("payroll_run_id", "work_order_id"),
  CONSTRAINT "payroll_run_entries_payroll_run_id_fkey"
    FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_run_entries_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "payroll_run_entries_work_order_id_idx" ON "payroll_run_entries"("work_order_id");

-- Ajustes (bonos / adelantos / deducciones) -----------------------------------
CREATE TABLE "payroll_adjustments" (
  "id"              TEXT                    PRIMARY KEY,
  "payroll_run_id"  TEXT                    NOT NULL,
  "kind"            "PayrollAdjustmentKind" NOT NULL,
  "amount"          DECIMAL(18,2)           NOT NULL,
  "note"            TEXT,
  "created_by_id"   TEXT                    NOT NULL,
  "created_at"      TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_adjustments_payroll_run_id_fkey"
    FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_adjustments_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "payroll_adjustments_payroll_run_id_idx" ON "payroll_adjustments"("payroll_run_id");
