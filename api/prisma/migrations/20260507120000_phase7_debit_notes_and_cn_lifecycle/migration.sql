-- Fase 7 · Notas débito (DN) + ciclo de vida de notas crédito (issue/void).
--
-- Cambios:
--  1. Nuevos enums `DebitNoteReason` y `DebitNoteStatus`.
--  2. Nuevas tablas `debit_notes` y `debit_note_lines` (espejo estructural de CN).
--  3. Auditoría de emisión / anulación en `credit_notes`:
--       - `issued_by_id`, `voided_at`, `voided_reason`, `voided_by_id`.
--     (la factura ya tenía voidedAt; aquí lo alineamos para CN/DN).
--
-- Regla operativa: la emisión (ISSUED) de una DN aceptada reabre el cobro en caja,
-- porque el saldo de factura pasa a `grandTotal - SUM(CN.issued) + SUM(DN.issued)`.
-- Esa lógica vive en `InvoicePaymentsService` y `InvoicesService.shape`.

CREATE TYPE "DebitNoteReason" AS ENUM ('PRICE_CORRECTION', 'ADDITIONAL_CHARGE', 'INTEREST', 'OTHER');
CREATE TYPE "DebitNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOIDED');

-- ---------------------------------------------------------------------------
-- credit_notes · auditoría de emisión / anulación
-- ---------------------------------------------------------------------------

ALTER TABLE "credit_notes"
  ADD COLUMN "issued_by_id"   TEXT,
  ADD COLUMN "voided_at"      TIMESTAMP(3),
  ADD COLUMN "voided_reason"  TEXT,
  ADD COLUMN "voided_by_id"   TEXT;

ALTER TABLE "credit_notes"
  ADD CONSTRAINT "credit_notes_issued_by_id_fkey"
  FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_notes"
  ADD CONSTRAINT "credit_notes_voided_by_id_fkey"
  FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- debit_notes
-- ---------------------------------------------------------------------------

CREATE TABLE "debit_notes" (
  "id"                    TEXT NOT NULL,
  "fiscal_resolution_id"  TEXT NOT NULL,
  "debit_note_number"     INTEGER NOT NULL,
  "document_number"       VARCHAR(48) NOT NULL,
  "invoice_id"            TEXT NOT NULL,
  "status"                "DebitNoteStatus" NOT NULL DEFAULT 'DRAFT',
  "reason"                "DebitNoteReason" NOT NULL,
  "reason_description"    TEXT NOT NULL,
  "subtotal"              DECIMAL(18,2) NOT NULL,
  "total_discount"        DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total_tax"             DECIMAL(18,2) NOT NULL DEFAULT 0,
  "grand_total"           DECIMAL(18,2) NOT NULL,
  "cufe"                  VARCHAR(128),
  "dian_provider"         VARCHAR(40),
  "dian_environment"      VARCHAR(20),
  "issued_at"             TIMESTAMP(3),
  "issued_by_id"          TEXT,
  "voided_at"             TIMESTAMP(3),
  "voided_reason"         TEXT,
  "voided_by_id"          TEXT,
  "created_by_id"         TEXT NOT NULL,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "debit_notes_document_number_key" ON "debit_notes"("document_number");
CREATE UNIQUE INDEX "debit_notes_fiscal_resolution_id_debit_note_number_key"
  ON "debit_notes"("fiscal_resolution_id", "debit_note_number");
CREATE INDEX "debit_notes_invoice_id_idx" ON "debit_notes"("invoice_id");
CREATE INDEX "debit_notes_status_created_at_idx" ON "debit_notes"("status", "created_at");

ALTER TABLE "debit_notes"
  ADD CONSTRAINT "debit_notes_fiscal_resolution_id_fkey"
  FOREIGN KEY ("fiscal_resolution_id") REFERENCES "fiscal_resolutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "debit_notes"
  ADD CONSTRAINT "debit_notes_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "debit_notes"
  ADD CONSTRAINT "debit_notes_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "debit_notes"
  ADD CONSTRAINT "debit_notes_issued_by_id_fkey"
  FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "debit_notes"
  ADD CONSTRAINT "debit_notes_voided_by_id_fkey"
  FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- debit_note_lines
-- ---------------------------------------------------------------------------

CREATE TABLE "debit_note_lines" (
  "id"                         TEXT NOT NULL,
  "debit_note_id"              TEXT NOT NULL,
  "line_type"                  "InvoiceLineType" NOT NULL,
  "sort_order"                 INTEGER NOT NULL DEFAULT 0,
  "description"                VARCHAR(2000) NOT NULL,
  "quantity"                   DECIMAL(18,4) NOT NULL,
  "unit_price"                 DECIMAL(18,2) NOT NULL,
  "discount_amount"            DECIMAL(18,2) NOT NULL DEFAULT 0,
  "tax_rate_percent_snapshot"  DECIMAL(5,2) NOT NULL DEFAULT 0,
  "tax_rate_kind_snapshot"     "TaxRateKind",
  "line_total"                 DECIMAL(18,2) NOT NULL,
  "tax_amount"                 DECIMAL(18,2) NOT NULL DEFAULT 0,
  "created_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "debit_note_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "debit_note_lines_debit_note_id_sort_order_idx"
  ON "debit_note_lines"("debit_note_id", "sort_order");

ALTER TABLE "debit_note_lines"
  ADD CONSTRAINT "debit_note_lines_debit_note_id_fkey"
  FOREIGN KEY ("debit_note_id") REFERENCES "debit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
