-- Catálogo: galón (inventario / recepciones). Idempotente por slug.
INSERT INTO "measurement_units" ("id", "slug", "name", "sort_order")
VALUES ('cmumeasureunitgallon', 'gallon', 'Galón', 32)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order";
