-- Fase 8 · Reportes y paneles de negocio.
-- Índices adicionales que mejoran los nuevos reportes sin cambiar la semántica.
--   * work_orders(assigned_to_id, delivered_at) → Informe «Utilidad por técnico»: filtra
--     DELIVERED en un rango de `deliveredAt` y agrupa por `assignedToId`.
--   * inventory_items(is_active, track_stock) → Informe «Stock crítico»: filtra sólo ítems
--     activos con control de stock antes de aplicar el umbral global.
-- CREATE INDEX CONCURRENTLY no funciona dentro de transacción implícita de Prisma,
-- así que usamos CREATE INDEX IF NOT EXISTS (se ejecuta fuera de horario con migración
-- manual si la tabla se hace enorme).

CREATE INDEX IF NOT EXISTS "work_orders_assigned_to_id_delivered_at_idx"
  ON "work_orders"("assigned_to_id", "delivered_at");

CREATE INDEX IF NOT EXISTS "inventory_items_is_active_track_stock_idx"
  ON "inventory_items"("is_active", "track_stock");
