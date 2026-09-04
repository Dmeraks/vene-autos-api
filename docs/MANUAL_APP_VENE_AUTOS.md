# Vene Autos — Manual de la aplicación (resumen)

Guía breve para quien usa el **panel del taller** día a día. Lo que ves en pantalla depende de tu **rol** (permisos); si falta un menú, es normal.

---

## 1. Cómo empezás

1. Abrís la dirección del panel e ingresás **correo y contraseña**.
2. Si el taller usa varios módulos, el sistema te lleva al **inicio** o al último lugar donde estabas (según configuración).
3. **Cerrar sesión** está en la parte superior del encabezado.

**Consulta pública:** existe una página para **consultar una orden con código** (sin entrar al panel completo), pensada para clientes o mensajes de texto.

---

## 2. Inicio

**Qué es:** tablero con accesos rápidos y resumen del día a día.

**Para qué sirve:** saltar a **caja**, **órdenes**, **ventas** u otras áreas sin buscar en el menú.

---

## 3. Órdenes de trabajo (OT)

**Qué son:** el trabajo que le hacés a un vehículo (diagnóstico, repuestos, mano de obra, estados hasta entregada).

**Flujo típico**

1. **Nueva orden:** datos del cliente/vehículo, descripción, consentimiento si aplica.
2. **En taller:** cargás **líneas** (repuestos o mano de obra), avanzás estados (recibida, en taller, esperando repuestos, lista, etc.).
3. **Cobros:** cuando corresponde, se registra el cobro vinculado a la orden (desde caja o según permisos).
4. **Cierre:** orden **entregada** o **cancelada** según el caso.

Podés verlas en **lista**, **cuadrícula** o **detalle**; podés **buscar** por código, patente o cliente.

---

## 4. Caja

**Qué es:** la **sesión de caja** del día: quién la abrió, movimientos de dinero que entra y sale, y cierre.

**Flujo típico**

1. **Abrir caja** al comenzar el turno (si te corresponde).
2. Registrar **ingresos** (cobros) y, según tu rol, **egresos** o **pedidos de egreso** para que un responsable los apruebe.
3. **Cerrar caja** al finalizar (quien tenga permiso).

Sin caja abierta, algunas cosas (por ejemplo **recepción de mercadería**) pueden no mostrarse.

---

## 5. Ventas

**Qué es:** ventas de **mostrador** o ligadas a una **orden** ya trabajada.

**Flujo típico**

1. Crear venta en **borrador** y cargar líneas (repuestos / servicios).
2. **Confirmar** cuando los datos están bien (afecta inventario en ventas de mostrador).
3. Registrar **pagos** en caja cuando el cliente paga.

---

## 6. Facturación

**Qué es:** facturas y notas fiscales cuando el taller usa **facturación electrónica** (DIAN).

**Flujo típico:** generar factura desde una venta ya confirmada, revisar estado, y usar **notas** solo cuando haga falta a nivel fiscal. Si tu taller no activó este módulo, puede no aparecer el menú.

---

## 7. Clientes y vehículos

**Clientes:** personas o empresas a las que facturás y asociás vehículos.

**Vehículos:** patente, datos del auto, historial de órdenes.

**Flujo:** muchas veces **cliente → vehículo → orden**; también podés buscar por patente desde la orden.

---

## 8. Recepción (compras al taller)

**Qué es:** registrar **mercadería que entró** (compra a proveedor) y actualizar stock.

Suele usarse cuando hay **caja abierta** y permiso de recepción.

---

## 9. Repuestos (inventario)

**Qué es:** catálogo de **ítems** de repuesto, precios de referencia, stock.

**Aceite:** vista pensada para el rubro de **lubricantes** (mismo inventario, presentación práctica).

---

## 10. Informes

**Qué es:** reportes **agrupados** del taller (operación y economía según lo habilitado).

Sirven para revisar períodos sin entrar orden por orden.

---

## 11. Nómina

**Qué es:** pago semanal a **técnicos** según reglas de comisión sobre mano de obra.

**Flujo típico:** revisar la semana, **calcular**, ajustar si hace falta, y **pagar** (genera movimiento de egreso en caja). Solo quien tenga permiso ve montos completos o configura porcentajes.

---

## 12. Administración (menús que suelen estar acá)

| Menú | Para qué sirve (en pocas palabras) |
|------|-------------------------------------|
| **Usuarios** | Dar de alta cuentas, activar o desactivar, asignar roles. |
| **Roles** | Armár qué puede hacer cada perfil (lectura, edición, caja, etc.). |
| **Servicios** | Lista de **mano de obra** o trabajos predefinidos para cargar en órdenes o ventas. |
| **Impuestos** | IVA y otros porcentajes que usa el taller en líneas. |
| **Resoluciones fiscales** | Datos de numeración para facturación electrónica (cuando aplica). |
| **Configuración** | Ajustes generales del taller (tema, tiempos, políticas, datos del negocio, etc.). |
| **Auditoría** | Registro de **quién hizo qué** y cuándo (cambios importantes). |

Hay también herramientas internas como **vista por rol** (simular permisos), si tu usuario lo permite.

---

## 13. Orden sugerido en el día a día

1. **Abrir caja** si tocó turno.  
2. **Órdenes:** ingresar trabajo, cargar repuestos/MO, avanzar estados.  
3. **Ventas** cuando cobrás mostrador o cerrás una venta ligada a OT.  
4. **Facturación** solo si el taller la usa.  
5. **Cerrar caja** al terminar.  
6. **Informes / nómina** en momentos de cierre de período o pago a mecánicos.

---

*Vene Autos — panel del taller. Para detalle de permisos y roles, ver `api/docs/MANUAL_ROLES_Y_PERMISOS.md`.*
