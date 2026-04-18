-- Fase 8++ · Inventario: separar la referencia del fabricante del nombre.
-- Hasta ahora la referencia (p. ej. "# 00", "K-2015") venía embebida en `name`
-- con guiones, dificultando la lectura en tabla y recibos. Se introduce el
-- campo opcional `reference` como columna dedicada. Default vacío para que
-- los ítems existentes no requieran migración de datos.
ALTER TABLE "inventory_items"
  ADD COLUMN "reference" VARCHAR(120) NOT NULL DEFAULT '';
