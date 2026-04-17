-- Código visible para cliente (comprobante / seguimiento), derivado de order_number.
ALTER TABLE "work_orders" ADD COLUMN "public_code" VARCHAR(32);

UPDATE "work_orders"
SET "public_code" = 'VEN-' || lpad("order_number"::text, GREATEST(4, length("order_number"::text)), '0');

ALTER TABLE "work_orders" ALTER COLUMN "public_code" SET NOT NULL;

CREATE UNIQUE INDEX "work_orders_public_code_key" ON "work_orders"("public_code");
