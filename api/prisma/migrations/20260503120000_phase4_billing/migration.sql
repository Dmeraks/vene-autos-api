-- Fase 4 · Factura electrónica DIAN (preparación)
-- Introduce la capa de documento fiscal. Todo queda inactivo hasta que el taller
-- encienda `dian.enabled=true` en Configuración y registre una resolución DIAN.

CREATE TYPE "FiscalResolutionKind" AS ENUM ('ELECTRONIC_INVOICE', 'POS', 'CONTINGENCY');

CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOIDED');

CREATE TYPE "InvoiceSource" AS ENUM ('SALE', 'WORK_ORDER');

CREATE TYPE "InvoiceLineType" AS ENUM ('PART', 'LABOR');

CREATE TYPE "InvoiceDispatchStatus" AS ENUM (
    'PENDING',
    'SUBMITTED',
    'ACCEPTED',
    'REJECTED',
    'ERROR',
    'NOT_CONFIGURED'
);

CREATE TYPE "CreditNoteReason" AS ENUM ('VOID', 'ADJUSTMENT', 'RETURN', 'DISCOUNT');

CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOIDED');

-- ----------------------------------------------------------------------------
-- fiscal_resolutions: autorizaciones DIAN vigentes (prefijo, rango, vigencia).
-- ----------------------------------------------------------------------------
CREATE TABLE "fiscal_resolutions" (
    "id" TEXT NOT NULL,
    "kind" "FiscalResolutionKind" NOT NULL DEFAULT 'ELECTRONIC_INVOICE',
    "resolution_number" VARCHAR(80) NOT NULL,
    "prefix" VARCHAR(16) NOT NULL,
    "range_from" INTEGER NOT NULL,
    "range_to" INTEGER NOT NULL,
    "next_number" INTEGER NOT NULL,
    "valid_from" DATE,
    "valid_until" DATE,
    "technical_key" VARCHAR(200),
    "test_set_id" VARCHAR(80),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_resolutions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_resolutions_range_valid_ck" CHECK ("range_from" > 0 AND "range_to" >= "range_from"),
    CONSTRAINT "fiscal_resolutions_next_in_range_ck" CHECK ("next_number" >= "range_from" AND "next_number" <= "range_to" + 1)
);

CREATE UNIQUE INDEX "fiscal_resolutions_kind_prefix_resolution_number_key"
    ON "fiscal_resolutions"("kind", "prefix", "resolution_number");

CREATE INDEX "fiscal_resolutions_kind_is_active_idx" ON "fiscal_resolutions"("kind", "is_active");

-- Solo una resolución "default" activa por tipo.
CREATE UNIQUE INDEX "fiscal_resolutions_one_default_active_per_kind_key"
    ON "fiscal_resolutions"("kind")
    WHERE "is_default" = true AND "is_active" = true;

ALTER TABLE "fiscal_resolutions"
    ADD CONSTRAINT "fiscal_resolutions_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- invoices: documento fiscal emitido (snapshot inmutable de una Sale o WorkOrder).
-- ----------------------------------------------------------------------------
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "fiscal_resolution_id" TEXT NOT NULL,
    "invoice_number" INTEGER NOT NULL,
    "document_number" VARCHAR(48) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "InvoiceSource" NOT NULL,
    "sale_id" TEXT,
    "work_order_id" TEXT,

    -- Snapshots de cliente al momento de emitir
    "customer_id" TEXT,
    "customer_name" VARCHAR(200) NOT NULL,
    "customer_document_id" VARCHAR(40),
    "customer_phone" VARCHAR(40),
    "customer_email" VARCHAR(120),

    -- Totales congelados (el motor recomputa desde las líneas, pero guardamos para auditoría rápida)
    "subtotal" DECIMAL(18,2) NOT NULL,
    "total_discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_vat" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_inc" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(18,2) NOT NULL,

    -- Datos fiscales DIAN (se llenan cuando el proveedor responde ACCEPTED)
    "cufe" VARCHAR(128),
    "dian_provider" VARCHAR(40),
    "dian_environment" VARCHAR(20),
    "issued_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "voided_reason" TEXT,

    "internal_notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoices_source_has_ref_ck" CHECK (
        ("source" = 'SALE' AND "sale_id" IS NOT NULL AND "work_order_id" IS NULL) OR
        ("source" = 'WORK_ORDER' AND "work_order_id" IS NOT NULL AND "sale_id" IS NULL)
    )
);

CREATE UNIQUE INDEX "invoices_fiscal_resolution_id_invoice_number_key"
    ON "invoices"("fiscal_resolution_id", "invoice_number");

CREATE UNIQUE INDEX "invoices_document_number_key" ON "invoices"("document_number");

-- Una venta/orden solo puede tener una factura viva (las voided no bloquean):
CREATE UNIQUE INDEX "invoices_sale_id_live_key" ON "invoices"("sale_id") WHERE "status" != 'VOIDED';
CREATE UNIQUE INDEX "invoices_work_order_id_live_key" ON "invoices"("work_order_id") WHERE "status" != 'VOIDED';

CREATE INDEX "invoices_status_created_at_idx" ON "invoices"("status", "created_at");
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");
CREATE INDEX "invoices_created_by_id_idx" ON "invoices"("created_by_id");

ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_fiscal_resolution_id_fkey"
    FOREIGN KEY ("fiscal_resolution_id") REFERENCES "fiscal_resolutions"("id") ON DELETE RESTRICT;

ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT;

ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT;

ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL;

ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;

-- ----------------------------------------------------------------------------
-- invoice_lines: snapshot de cada ítem.
-- ----------------------------------------------------------------------------
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "line_type" "InvoiceLineType" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source_sale_line_id" TEXT,
    "source_work_order_line_id" TEXT,
    "inventory_item_id" TEXT,
    "service_id" TEXT,
    "tax_rate_id" TEXT,
    "description" VARCHAR(2000),
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_rate_percent_snapshot" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_rate_kind_snapshot" "TaxRateKind",
    "line_total" DECIMAL(18,2) NOT NULL,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_lines_invoice_id_sort_order_idx" ON "invoice_lines"("invoice_id", "sort_order");
CREATE INDEX "invoice_lines_inventory_item_id_idx" ON "invoice_lines"("inventory_item_id");
CREATE INDEX "invoice_lines_service_id_idx" ON "invoice_lines"("service_id");

ALTER TABLE "invoice_lines"
    ADD CONSTRAINT "invoice_lines_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE;

ALTER TABLE "invoice_lines"
    ADD CONSTRAINT "invoice_lines_inventory_item_id_fkey"
    FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL;

ALTER TABLE "invoice_lines"
    ADD CONSTRAINT "invoice_lines_service_id_fkey"
    FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL;

ALTER TABLE "invoice_lines"
    ADD CONSTRAINT "invoice_lines_tax_rate_id_fkey"
    FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- invoice_dispatch_events: cola/bitácora de intentos de envío al proveedor DIAN.
-- ----------------------------------------------------------------------------
CREATE TABLE "invoice_dispatch_events" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "InvoiceDispatchStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(40),
    "environment" VARCHAR(20),
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error_message" TEXT,
    "external_id" VARCHAR(128),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "requested_by_id" TEXT,

    CONSTRAINT "invoice_dispatch_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_dispatch_events_invoice_id_requested_at_idx"
    ON "invoice_dispatch_events"("invoice_id", "requested_at");

CREATE INDEX "invoice_dispatch_events_status_idx" ON "invoice_dispatch_events"("status");

ALTER TABLE "invoice_dispatch_events"
    ADD CONSTRAINT "invoice_dispatch_events_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE;

ALTER TABLE "invoice_dispatch_events"
    ADD CONSTRAINT "invoice_dispatch_events_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- credit_notes: anulación o ajuste de una factura emitida.
-- ----------------------------------------------------------------------------
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "fiscal_resolution_id" TEXT NOT NULL,
    "credit_note_number" INTEGER NOT NULL,
    "document_number" VARCHAR(48) NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" "CreditNoteReason" NOT NULL,
    "reason_description" TEXT NOT NULL,

    "subtotal" DECIMAL(18,2) NOT NULL,
    "total_discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(18,2) NOT NULL,

    "cufe" VARCHAR(128),
    "dian_provider" VARCHAR(40),
    "dian_environment" VARCHAR(20),
    "issued_at" TIMESTAMP(3),

    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_notes_fiscal_resolution_id_credit_note_number_key"
    ON "credit_notes"("fiscal_resolution_id", "credit_note_number");

CREATE UNIQUE INDEX "credit_notes_document_number_key" ON "credit_notes"("document_number");

CREATE INDEX "credit_notes_invoice_id_idx" ON "credit_notes"("invoice_id");
CREATE INDEX "credit_notes_status_created_at_idx" ON "credit_notes"("status", "created_at");

ALTER TABLE "credit_notes"
    ADD CONSTRAINT "credit_notes_fiscal_resolution_id_fkey"
    FOREIGN KEY ("fiscal_resolution_id") REFERENCES "fiscal_resolutions"("id") ON DELETE RESTRICT;

ALTER TABLE "credit_notes"
    ADD CONSTRAINT "credit_notes_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT;

ALTER TABLE "credit_notes"
    ADD CONSTRAINT "credit_notes_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;

CREATE TABLE "credit_note_lines" (
    "id" TEXT NOT NULL,
    "credit_note_id" TEXT NOT NULL,
    "source_invoice_line_id" TEXT,
    "line_type" "InvoiceLineType" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "description" VARCHAR(2000) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_rate_percent_snapshot" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_rate_kind_snapshot" "TaxRateKind",
    "line_total" DECIMAL(18,2) NOT NULL,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_note_lines_credit_note_id_sort_order_idx"
    ON "credit_note_lines"("credit_note_id", "sort_order");

ALTER TABLE "credit_note_lines"
    ADD CONSTRAINT "credit_note_lines_credit_note_id_fkey"
    FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE CASCADE;

ALTER TABLE "credit_note_lines"
    ADD CONSTRAINT "credit_note_lines_source_invoice_line_id_fkey"
    FOREIGN KEY ("source_invoice_line_id") REFERENCES "invoice_lines"("id") ON DELETE SET NULL;
