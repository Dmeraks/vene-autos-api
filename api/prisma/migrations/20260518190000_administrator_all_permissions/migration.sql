-- El rol `administrador` recibe el catálogo completo de permisos vía `prisma db seed` (`grantAllCatalogPermissions`).
-- Esta migración es un marcador idempotente para entornos que ya la tenían registrada en `_prisma_migrations`.
SELECT 1;
