-- Enlace opcional usuario → cliente maestro (rol portal: ver OT de vehículos de ese cliente).
ALTER TABLE "users" ADD COLUMN "portal_customer_id" TEXT;

ALTER TABLE "users"
ADD CONSTRAINT "users_portal_customer_id_fkey"
FOREIGN KEY ("portal_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_portal_customer_id_idx" ON "users"("portal_customer_id");
