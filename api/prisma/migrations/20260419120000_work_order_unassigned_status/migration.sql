-- Paso 1: agregar valor al enum (debe ir en migración aparte del DEFAULT en PG)
ALTER TYPE "WorkOrderStatus" ADD VALUE 'UNASSIGNED';
