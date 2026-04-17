-- Fase 6 (impuestos y catálogo de servicios): aditiva.
--   * Enum `InventoryItemKind` y columna `item_kind` en `inventory_items` (default PART).
--   * Tabla `tax_rates` (IVA / INC) y tabla `services` (mano de obra catalogada).
--   * Columnas opcionales en `work_order_lines` para impuesto, descuento, costo snapshot y servicio.
-- Sin borrados ni renombrados: las líneas e ítems existentes siguen válidos.

CREATE TYPE "InventoryItemKind" AS ENUM ('PART', 'SUPPLY', 'PRODUCT');

CREATE TYPE "TaxRateKind" AS ENUM ('VAT', 'INC');

ALTER TABLE "inventory_items"
  ADD COLUMN "item_kind" "InventoryItemKind" NOT NULL DEFAULT 'PART';

CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "TaxRateKind" NOT NULL,
    "rate_percent" DECIMAL(5,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tax_rates_slug_key" ON "tax_rates"("slug");
CREATE INDEX "tax_rates_is_active_sort_order_idx" ON "tax_rates"("is_active", "sort_order");

CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "default_unit_price" DECIMAL(18,2),
    "default_tax_rate_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "services_code_key" ON "services"("code");
CREATE INDEX "services_is_active_sort_order_idx" ON "services"("is_active", "sort_order");

ALTER TABLE "services"
  ADD CONSTRAINT "services_default_tax_rate_id_fkey"
  FOREIGN KEY ("default_tax_rate_id") REFERENCES "tax_rates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_order_lines"
  ADD COLUMN "service_id" TEXT,
  ADD COLUMN "tax_rate_id" TEXT,
  ADD COLUMN "discount_amount" DECIMAL(18,2),
  ADD COLUMN "cost_snapshot" DECIMAL(18,2);

ALTER TABLE "work_order_lines"
  ADD CONSTRAINT "work_order_lines_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_order_lines"
  ADD CONSTRAINT "work_order_lines_tax_rate_id_fkey"
  FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "work_order_lines_service_id_idx" ON "work_order_lines"("service_id");
CREATE INDEX "work_order_lines_tax_rate_id_idx" ON "work_order_lines"("tax_rate_id");
