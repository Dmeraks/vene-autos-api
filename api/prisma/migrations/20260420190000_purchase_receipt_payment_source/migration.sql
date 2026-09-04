-- Origen de pago de la recepción (efectivo en caja vs transferencia).
CREATE TYPE "PurchaseReceiptPaymentSource" AS ENUM ('CASH_REGISTER', 'BANK_TRANSFER');

ALTER TABLE "purchase_receipts" ADD COLUMN "payment_source" "PurchaseReceiptPaymentSource" NOT NULL DEFAULT 'BANK_TRANSFER';
