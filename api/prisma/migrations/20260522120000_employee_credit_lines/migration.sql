-- Crédito / cargos internos por empleado (líneas editables; total derivado en agregación).
CREATE TABLE "employee_credit_lines" (
    "id" TEXT NOT NULL,
    "debtor_user_id" TEXT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "voided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "employee_credit_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_credit_lines_debtor_user_id_voided_at_idx" ON "employee_credit_lines"("debtor_user_id", "voided_at");

ALTER TABLE "employee_credit_lines" ADD CONSTRAINT "employee_credit_lines_debtor_user_id_fkey" FOREIGN KEY ("debtor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_credit_lines" ADD CONSTRAINT "employee_credit_lines_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
