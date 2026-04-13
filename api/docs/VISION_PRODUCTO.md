# Visión de producto — Vene Autos (API)

Documento vivo: decisiones de negocio y orden de implementación acordados con el dueño del producto.

## Inventario y repuestos (decisiones)

### ¿El mecánico carga la línea al momento o solo al cerrar?

**Decisión:** el mecánico puede **agregar consumo / repuesto a la OT mientras la orden está abierta** (estados operativos: recibida, en taller, esperando repuestos, lista — no entregada ni cancelada).

**Recomendación técnica:** al implementar `WorkOrderLine` + movimientos de stock, validar el estado de la OT igual que hoy con las actualizaciones: **bloquear ediciones** cuando la OT esté `DELIVERED` o `CANCELLED`. Opcionalmente se puede exigir rol `work_orders:update` o un permiso fino `work_orders:add_line` para separar cajero vs mecánico.

### ¿Stock negativo permitido o bloqueado?

**Decisión por defecto recomendada para el negocio:** **bloquear** el descuento de inventario si el saldo quedaría por debajo de cero, salvo excepción explícita.

**Motivo:** evita “vender aire” y errores de conteo; el taller puede usar **orden de compra / recepción** (entrada de stock) cuando llegue el repuesto.

**Evolutivo:** un ajuste en `workshop.settings` (p. ej. `inventory.allow_negative_stock`) o un permiso elevado “forzar consumo sin stock” puede habilitarse más adelante si el taller lo necesita (backorder real).

### ¿Compras a proveedor suben stock en otro flujo?

**Decisión recomendada:** **sí, flujo separado** de la OT:

- **Entrada de mercancía** (recepción de compra / devolución / ajuste positivo): documento o pantalla “recibir compra”, cantidad, ítem, costo opcional, referencia a factura proveedor.
- **Salida de mercancía** ligada a **líneas de OT** cuando el mecánico confirma el repuesto usado.

Así la transmisión cambiada en taller **descuenta** el mismo SKU que entró cuando compraste la caja al proveedor.

## Fiscalidad Colombia (DIAN)

Queda **definido para implementación futura**: integración vía **tercero** o **directo con DIAN**. No bloquea cliente/vehículo/OT/inventario. Cuando se implemente, conviene capa de “documento electrónico” desacoplada del cobro en caja.

## Calidad y operación

**Política:** sumar o actualizar **pruebas automáticas** cuando el cambio sea **crítico** (caja, cobros, stock, permisos, migraciones de datos) o cuando el equipo lo considere necesario. No hace falta test por cada coma en textos o estilos.

## Roadmap técnico (orden)

1. **Cliente + vehículo + OT enlazada** — modelo formal, API CRUD, `vehicleId` en OT, migración legado (script).
2. **Historial** — consultas por vehículo (OT + cobros); texto libre en OT queda como respaldo hasta deprecar.
3. **Ítems de inventario + líneas en OT + movimientos de stock** — incluye entradas por compra.
4. **UI** — orquestación para taller.
5. **Capa fiscal** — cuando se elija proveedor o camino DIAN.
