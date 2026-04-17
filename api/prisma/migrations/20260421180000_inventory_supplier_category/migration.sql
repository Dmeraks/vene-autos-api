-- Proveedor y categoría como columnas propias (catálogo de repuestos).
ALTER TABLE "inventory_items" ADD COLUMN "supplier" VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE "inventory_items" ADD COLUMN "category" VARCHAR(200) NOT NULL DEFAULT '';
