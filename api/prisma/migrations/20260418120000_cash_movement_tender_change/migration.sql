-- Efectivo entregado (billete) y vuelto; `amount` sigue siendo el neto del movimiento en caja.
ALTER TABLE "cash_movements"
ADD COLUMN "tender_amount" DECIMAL(18,2),
ADD COLUMN "change_amount" DECIMAL(18,2);
