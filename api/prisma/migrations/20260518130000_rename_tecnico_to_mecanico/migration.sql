-- Renombrar el rol `tecnico` → `mecanico` y la categoría de caja
-- `nomina_tecnicos` → `nomina_mecanicos`. En el taller el puesto se llama
-- oficialmente "mecánico"; se conserva la asignación de usuarios al rol
-- original (UPDATE in-place).

UPDATE "roles"
   SET "slug" = 'mecanico',
       "name" = 'Mecánico'
 WHERE "slug" = 'tecnico';

UPDATE "cash_movement_categories"
   SET "slug" = 'nomina_mecanicos',
       "name" = 'Pago de nómina · Mecánicos'
 WHERE "slug" = 'nomina_tecnicos';
