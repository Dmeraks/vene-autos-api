-- Fase 2 (cálculo de totales): congelar el porcentaje de impuesto en la línea.
--   * Se agrega `tax_rate_percent_snapshot` DECIMAL(5,2) NULL en `work_order_lines`.
--   * Null = línea sin impuesto (flujo persona natural, compatible con datos históricos).
--   * El backend copia el ratePercent vigente al crear/editar la línea, para que un cambio
--     futuro de la tarifa (p.ej. IVA 19 → 21) no altere OT ya cerradas.
-- Sin backfill: las líneas previas quedan con null (no tenían taxRateId).

ALTER TABLE "work_order_lines"
  ADD COLUMN "tax_rate_percent_snapshot" DECIMAL(5,2);
