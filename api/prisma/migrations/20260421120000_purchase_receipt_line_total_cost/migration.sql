-- Total pagado en la línea (tal cual en informes); el costo unitario almacenado se deriva con techo a peso entero.
ALTER TABLE "purchase_receipt_lines" ADD COLUMN "line_total_cost" DECIMAL(18, 2);
