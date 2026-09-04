-- A lo sumo una sesión de caja en estado OPEN (refuerzo en BD; la app ya lo valida).
-- Expresión constante (1): todas las filas OPEN comparten el mismo valor indexado → máximo una fila.
CREATE UNIQUE INDEX "cash_sessions_one_open_at_a_time_idx" ON "cash_sessions" ((1))
WHERE
    "status" = 'OPEN';
