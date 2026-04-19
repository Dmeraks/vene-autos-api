-- Campos adicionales de vehículo en OT (licencia de tránsito / OCR).
ALTER TABLE "work_orders" ADD COLUMN "vehicle_line" VARCHAR(120);
ALTER TABLE "work_orders" ADD COLUMN "vehicle_cylinder_cc" VARCHAR(32);
ALTER TABLE "work_orders" ADD COLUMN "vehicle_color" VARCHAR(80);
