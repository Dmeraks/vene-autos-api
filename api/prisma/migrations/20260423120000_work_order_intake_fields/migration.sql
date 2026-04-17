-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "vehicle_brand" VARCHAR(80),
ADD COLUMN     "intake_odometer_km" INTEGER,
ADD COLUMN     "inspection_only" BOOLEAN NOT NULL DEFAULT false;
