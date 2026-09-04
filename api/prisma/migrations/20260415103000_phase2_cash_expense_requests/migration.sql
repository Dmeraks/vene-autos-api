-- CreateEnum
CREATE TYPE "CashExpenseRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "cash_expense_requests" (
    "id" TEXT NOT NULL,
    "status" "CashExpenseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "category_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "note" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "approval_note" TEXT,
    "result_movement_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_expense_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_expense_requests_result_movement_id_key" ON "cash_expense_requests"("result_movement_id");

-- CreateIndex
CREATE INDEX "cash_expense_requests_status_created_at_idx" ON "cash_expense_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "cash_expense_requests_requested_by_id_created_at_idx" ON "cash_expense_requests"("requested_by_id", "created_at");

-- AddForeignKey
ALTER TABLE "cash_expense_requests" ADD CONSTRAINT "cash_expense_requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "cash_movement_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_expense_requests" ADD CONSTRAINT "cash_expense_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_expense_requests" ADD CONSTRAINT "cash_expense_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_expense_requests" ADD CONSTRAINT "cash_expense_requests_result_movement_id_fkey" FOREIGN KEY ("result_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
