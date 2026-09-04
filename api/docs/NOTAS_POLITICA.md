# Política de longitud mínima en notas operativas

Las notas obligatorias del taller (caja, solicitudes de egreso, recepción de compra, etc.) validan la **cantidad de caracteres después de quitar espacios al inicio y al final** (`trim`), igual en el API y en el panel.

## Claves en `workshop_settings`

| Clave | Uso | Valor por defecto (seed `create`) | Rango |
|--------|-----|-----------------------------------|--------|
| `notes.min_length_chars` | **General:** apertura de caja, ingresos/egresos de caja, solicitud de egreso, aprobación/rechazo de solicitudes, nota de recepción de compra, nota de diferencia en arqueo al cerrar caja. | **50** | 5–500 |
| `notes.min_length.work_order_payment` | **Solo cobros registrados en una orden de trabajo** (`POST /work-orders/:id/payments`). Suele exigirse más detalle que en caja genérica. | **70** | 5–500 |

Recomendación: el mínimo de cobros en OT debería ser **≥** al mínimo general (no está forzado en el API, pero evita reglas incoherentes).

## Mantenimiento

1. **Bases nuevas:** `npx prisma db seed` crea ambas claves con los valores por defecto anteriores.
2. **Bases ya existentes:** ejecutá `npx prisma db seed` (o guardá **Configuración del taller** en el panel: si falta la fila de cobros en OT, el primer guardado puede persistir el valor sugerido 70). Ajustá `notes.min_length_chars` en la misma pantalla si querés subir el mínimo general (p. ej. desde 25 heredado hacia 50).
3. **Cambio operativo:** administradores con `settings:update` editan los valores en el panel (**Configuración del taller**) o vía `PATCH /api/v1/settings`.
4. **Formularios:** cualquier usuario autenticado obtiene los mínimos efectivos con `GET /api/v1/settings/ui-context` (`notesMinLengthChars`, `notesMinLengthWorkOrderPayment`) sin necesitar `settings:read`.

## Referencia técnica

- Validación: `NotesPolicyService` (`api/src/common/notes-policy/notes-policy.service.ts`).
- Cobros OT: `WorkOrderPaymentsService` usa el ámbito `work_order_payment`.
- El resto de notas operativas usan el ámbito `general`.
