-- CreateEnum
CREATE TYPE "WorkOrderPaymentKind" AS ENUM ('PARTIAL', 'FULL_SETTLEMENT');

-- AlterTable
ALTER TABLE "work_order_payments" ADD COLUMN "kind" "WorkOrderPaymentKind" NOT NULL DEFAULT 'PARTIAL';
