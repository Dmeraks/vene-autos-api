-- Datos de cliente/vehículo en OT para facturación y reportes.
ALTER TABLE "work_orders" ADD COLUMN     "customer_email" VARCHAR(120),
ADD COLUMN     "vehicle_model" VARCHAR(80);
