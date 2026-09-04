-- Cotizaciones (presupuestos previos a OT). SKUs auto: contador `workshop_counters`.

CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED');

CREATE TYPE "QuoteLineType" AS ENUM ('PART', 'LABOR');

CREATE TABLE "workshop_counters" (
    "key" VARCHAR(64) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "workshop_counters_pkey" PRIMARY KEY ("key")
);

INSERT INTO "workshop_counters" ("key", "value") VALUES ('inventory_ad_hoc_sku', 0)
ON CONFLICT DO NOTHING;

CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "quote_number" SERIAL NOT NULL,
    "public_code" VARCHAR(32) NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "valid_until" TIMESTAMP(3),
    "vehicle_id" TEXT,
    "customer_name" VARCHAR(200),
    "customer_phone" VARCHAR(40),
    "customer_email" VARCHAR(120),
    "vehicle_plate" VARCHAR(80),
    "vehicle_brand" VARCHAR(80),
    "vehicle_model" VARCHAR(80),
    "internal_notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quotes_quote_number_key" ON "quotes"("quote_number");
CREATE UNIQUE INDEX "quotes_public_code_key" ON "quotes"("public_code");

CREATE INDEX "quotes_status_created_at_idx" ON "quotes"("status", "created_at");
CREATE INDEX "quotes_vehicle_id_idx" ON "quotes"("vehicle_id");

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "line_type" "QuoteLineType" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "inventory_item_id" TEXT,
    "service_id" TEXT,
    "tax_rate_id" TEXT,
    "description" VARCHAR(2000),
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,2),
    "discount_amount" DECIMAL(18,2),
    "tax_rate_percent_snapshot" DECIMAL(5,2),

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quote_lines_quote_id_sort_order_idx" ON "quote_lines"("quote_id", "sort_order");
CREATE INDEX "quote_lines_inventory_item_id_idx" ON "quote_lines"("inventory_item_id");

ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
