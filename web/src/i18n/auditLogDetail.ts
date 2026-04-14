/**
 * Textos largos para el modal "Ver detalles" del registro de auditoría.
 */
import { auditActionTitleEs, auditEntityTitleEs } from './auditLogPresentation'

export type AuditRowForDetail = {
  action: string
  entityType: string
  entityId: string | null
  createdAt: string
  nextPayload: unknown
  previousPayload?: unknown | null
  reason?: string | null
  requestId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  actor: { email: string; fullName: string } | null
}

export type AuditDetailSection = {
  heading: string
  body: string
}

function statusMeaningEs(code: number): string {
  if (code >= 200 && code < 300) {
    if (code === 201) return 'La operación se aceptó y se creó un recurso nuevo (código 201).'
    if (code === 204) return 'La operación se aceptó sin cuerpo de respuesta (204).'
    return 'La operación se completó correctamente en el servidor.'
  }
  if (code === 400) return 'El servidor rechazó los datos enviados (validación o reglas de negocio). Revisá mensajes en el panel.'
  if (code === 401) return 'No había sesión válida o el token caducó. No se aplicó el cambio.'
  if (code === 403) return 'La sesión es válida pero este usuario no tiene permiso para esa acción.'
  if (code === 404) return 'No se encontró el recurso pedido (ruta o ID incorrecto o ya borrado).'
  if (code === 409) return 'Conflicto: por ejemplo, un dato duplicado o un estado que no permite la operación.'
  if (code >= 500) return 'Error interno del servidor. Si persiste, conviene revisar logs del API.'
  return 'La petición terminó con un código no habitual; revisá el panel o los logs del API.'
}

function pathHintEs(path: string): string | null {
  if (path.includes('/auth/login')) return 'Intento de inicio de sesión con correo y contraseña.'
  if (path.includes('/auth/logout')) return 'Cierre de sesión explícito.'
  if (path.includes('/work-orders')) return 'Órdenes de trabajo: alta, cambios, líneas o cobros vinculados a una OT.'
  if (path.includes('/cash/')) return 'Caja: sesión, movimientos, delegados o solicitudes de egreso.'
  if (path.includes('/users')) return 'Usuarios del taller: alta o modificación de datos y roles.'
  if (path.includes('/roles')) return 'Roles y permisos del sistema.'
  if (path.includes('/settings')) return 'Parámetros globales del taller (sesión, políticas, etc.).'
  if (path.includes('/customers') || path.includes('/vehicles')) return 'Clientes o vehículos del directorio.'
  if (path.includes('/inventory')) return 'Inventario o recepción de compra.'
  if (path.includes('/audit-logs')) return 'Consulta al propio registro de auditoría.'
  return null
}

function explainHttp(row: AuditRowForDetail, path: string, status: number): AuditDetailSection[] {
  const hint = pathHintEs(path)
  const intro =
    'Esta fila es una traza HTTP: el panel (u otro cliente) llamó al API y el servidor respondió con el código indicado. ' +
    'A veces verás además otra fila del mismo instante con el evento de dominio (por ejemplo “Caja abierta”): esa segunda fila describe mejor el negocio; la HTTP confirma qué ruta se tocó y si respondió bien o no.'

  const bullets = [
    `Método y ruta: ${path}`,
    `Código HTTP ${status}: ${statusMeaningEs(status)}`,
    hint ? `Contexto: ${hint}` : '',
    row.ipAddress ? `Dirección IP registrada: ${row.ipAddress}` : '',
    row.requestId ? `ID de petición (si lo envió el cliente): ${row.requestId}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  return [
    { heading: 'Qué es este registro', body: intro },
    { heading: 'Detalle de la petición', body: bullets },
  ]
}

function payloadSnippet(obj: unknown, maxLen = 600): string {
  if (obj === null || obj === undefined) return '(sin datos adjuntos)'
  try {
    const s = JSON.stringify(obj, null, 2)
    if (s.length <= maxLen) return s
    return `${s.slice(0, maxLen)}…\n\n(mostrado truncado; ver bloque “JSON completo” abajo)`
  } catch {
    return String(obj)
  }
}

const DOMAIN_ACTION_HELP: Record<string, string> = {
  'auth.login': 'Alguien inició sesión correctamente. El registro ayuda a saber quién estaba en el panel en ese momento.',
  'auth.logout': 'Cierre de sesión voluntario. La sesión deja de ser válida para nuevas peticiones.',
  'users.create': 'Se dio de alta un usuario nuevo con los roles que se eligieron en el formulario.',
  'users.reset_password':
    'Un administrador asignó una contraseña nueva a la cuenta; se cerraron todas las sesiones de ese usuario.',
  'users.update': 'Se modificaron datos del usuario (nombre, roles o estado activo/inactivo).',
  'roles.create': 'Se creó un rol nuevo con un conjunto de permisos.',
  'roles.update': 'Se cambió el nombre, la descripción o los permisos de un rol existente.',
  'roles.delete': 'Se eliminó un rol que ya no debía existir (solo si no tenía usuarios asignados).',
  'settings.update': 'Se guardaron uno o más parámetros globales del taller (tiempo de sesión, moneda, etc.).',
  'cash_sessions.open': 'Se abrió una nueva sesión de caja con un monto inicial de apertura.',
  'cash_sessions.close': 'Se cerró la sesión de caja con arqueo y, si aplica, nota de diferencias.',
  'cash_movements.income': 'Se registró un ingreso de efectivo en la sesión abierta (categoría y monto en el JSON).',
  'cash_movements.expense': 'Se registró un egreso de efectivo en la sesión abierta.',
  'cash_delegates.set': 'Se actualizó la lista de personas autorizadas a registrar egresos directos.',
  'cash_expense_requests.created': 'Alguien creó una solicitud de egreso pendiente de aprobación.',
  'cash_expense_requests.approved': 'Un aprobador aceptó la solicitud y se generó el movimiento de egreso en caja.',
  'cash_expense_requests.rejected': 'Un aprobador rechazó la solicitud; no hubo egreso. El motivo puede venir en “Motivo / nota”.',
  'cash_expense_requests.cancelled': 'El solicitante o el sistema canceló la solicitud antes de aprobarse.',
  'work_orders.created': 'Se creó una orden de trabajo nueva (cliente, vehículo o descripción según lo cargado).',
  'work_orders.updated': 'Se cambió estado, descripción o tope de cobros de una orden.',
  'work_orders.payment_recorded': 'Se registró un cobro vinculado a la orden; también genera movimiento de ingreso en caja.',
  'work_order_lines.created': 'Se agregó una línea (repuesto o mano de obra) a una orden.',
  'work_order_lines.updated': 'Se ajustó cantidad, precio o descripción de una línea.',
  'work_order_lines.deleted': 'Se quitó una línea de la orden.',
  'customers.created': 'Se agregó un cliente al directorio.',
  'customers.updated': 'Se actualizaron datos de un cliente.',
  'vehicles.created': 'Se registró un vehículo asociado a un cliente.',
  'vehicles.updated': 'Se actualizaron datos del vehículo.',
  'inventory_items.created': 'Se creó un ítem en el catálogo de inventario.',
  'inventory_items.updated': 'Se modificó nombre, costo, stock u otras propiedades del ítem.',
  'inventory.purchase_receipt_created': 'Se registró una recepción de compra que actualiza stock (y costo si aplica).',
}

function explainDomain(row: AuditRowForDetail): AuditDetailSection[] {
  const actionTitle = auditActionTitleEs(row.action)
  const entityTitle = auditEntityTitleEs(row.entityType)
  const help = DOMAIN_ACTION_HELP[row.action] ?? null

  const intro =
    `Este evento describe un cambio en el negocio (${actionTitle}), sobre ${entityTitle}. ` +
    (help
      ? help
      : 'Los datos concretos (montos, IDs, etc.) suelen verse en el JSON de “Estado nuevo” más abajo.')

  const sections: AuditDetailSection[] = [{ heading: 'Qué pasó', body: intro }]

  if (row.reason?.trim()) {
    sections.push({
      heading: 'Motivo / nota',
      body: row.reason.trim(),
    })
  }

  if (row.previousPayload != null && row.previousPayload !== undefined) {
    sections.push({
      heading: 'Estado anterior (resumen)',
      body: payloadSnippet(row.previousPayload, 800),
    })
  }

  sections.push({
    heading: row.previousPayload != null ? 'Estado nuevo (resumen)' : 'Datos registrados (resumen)',
    body: payloadSnippet(row.nextPayload, 800),
  })

  enrichDomainSections(row, sections)
  return sections
}

function personBrief(p: unknown): string | null {
  if (!p || typeof p !== 'object') return null
  const o = p as Record<string, unknown>
  const name = typeof o.fullName === 'string' ? o.fullName.trim() : ''
  const email = typeof o.email === 'string' ? o.email.trim() : ''
  if (name && email) return `${name} (${email})`
  if (name) return name
  if (email) return email
  return null
}

/** Añade bloques legibles según acción (montos, notas, solicitante, etc.). */
function enrichDomainSections(row: AuditRowForDetail, sections: AuditDetailSection[]): void {
  if (!row.nextPayload || typeof row.nextPayload !== 'object') return
  const p = row.nextPayload as Record<string, unknown>

  if (row.action === 'cash_expense_requests.approved') {
    const lines: string[] = []
    lines.push(
      '“Quién” en la cabecera del modal es quien ejecutó la acción en el sistema: en una aprobación de egreso, es quien autorizó el movimiento (dueño o administrador con permiso).',
    )
    if (typeof p.amount === 'string' && p.amount) {
      lines.push(`Monto aprobado y egresado en caja: ${p.amount} (según la moneda configurada del taller).`)
    }
    if (typeof p.categorySlug === 'string' && p.categorySlug) {
      lines.push(`Categoría contable de la solicitud: ${p.categorySlug}.`)
    }
    const reqBy = personBrief(p.requestedBy)
    if (reqBy) {
      lines.push(`Quién había solicitado el egreso: ${reqBy}.`)
    }
    if (typeof p.requestNote === 'string' && p.requestNote.trim()) {
      lines.push(`Nota que dejó el solicitante al crear la solicitud:\n${p.requestNote.trim()}`)
    } else {
      lines.push('Nota del solicitante: no figura texto en este registro (puede ser datos anteriores a la política de notas).')
    }
    if (typeof p.approvalNote === 'string' && p.approvalNote.trim()) {
      lines.push(`Nota del aprobador:\n${p.approvalNote.trim()}`)
    } else {
      lines.push('Nota del aprobador: no figura en el JSON (registros viejos o migración).')
    }
    if (typeof p.movementId === 'string' && p.movementId) {
      lines.push(`ID del movimiento de caja generado: ${p.movementId} (podés cruzarlo con la fila “Egreso en caja” cercana en el tiempo).`)
    }
    sections.splice(1, 0, { heading: 'Resumen operativo (egreso aprobado)', body: lines.join('\n\n') })
    return
  }

  if (row.action === 'cash_expense_requests.created') {
    const lines: string[] = []
    if (typeof p.amount === 'string' && p.amount) lines.push(`Monto solicitado: ${p.amount}.`)
    if (typeof p.categorySlug === 'string' && p.categorySlug) lines.push(`Categoría: ${p.categorySlug}.`)
    if (typeof p.note === 'string' && p.note.trim()) {
      lines.push(`Nota del solicitante:\n${p.note.trim()}`)
    }
    if (lines.length > 0) {
      sections.splice(1, 0, { heading: 'Detalle de la solicitud', body: lines.join('\n\n') })
    }
    return
  }

  if (row.action === 'cash_expense_requests.rejected') {
    if (typeof p.rejectionReason === 'string' && p.rejectionReason.trim()) {
      sections.splice(1, 0, {
        heading: 'Motivo del rechazo',
        body: p.rejectionReason.trim(),
      })
    }
    return
  }

  if (row.action === 'cash_movements.income' || row.action === 'cash_movements.expense') {
    if (typeof p.note === 'string' && p.note.trim()) {
      sections.splice(1, 0, {
        heading: 'Nota del movimiento',
        body: p.note.trim(),
      })
    }
    return
  }

  if (row.action === 'work_orders.payment_recorded') {
    const lines: string[] = []
    if (typeof p.amount === 'string' && p.amount) lines.push(`Monto cobrado: ${p.amount}.`)
    if (typeof p.orderNumber === 'number') lines.push(`Número de orden: ${p.orderNumber}.`)
    if (typeof p.note === 'string' && p.note.trim()) {
      lines.push(`Nota del cobro:\n${p.note.trim()}`)
    }
    if (lines.length > 0) {
      sections.splice(1, 0, { heading: 'Detalle del cobro', body: lines.join('\n\n') })
    }
    return
  }

  if (row.action === 'inventory.purchase_receipt_created') {
    const lines: string[] = []
    if (typeof p.lineCount === 'number') lines.push(`Cantidad de líneas: ${p.lineCount}.`)
    if (typeof p.note === 'string' && p.note.trim()) {
      lines.push(`Nota de la recepción:\n${p.note.trim()}`)
    }
    if (typeof p.supplierReference === 'string' && p.supplierReference.trim()) {
      lines.push(`Referencia proveedor / factura: ${p.supplierReference.trim()}`)
    }
    if (lines.length > 0) {
      sections.splice(1, 0, { heading: 'Recepción de compra', body: lines.join('\n\n') })
    }
  }
}

/** Secciones en español + JSON completo para el modal de detalle. */
export function buildAuditDetailSections(row: AuditRowForDetail): {
  sections: AuditDetailSection[]
  fullJson: string
} {
  if (row.entityType === 'HTTP') {
    const o = row.nextPayload && typeof row.nextPayload === 'object' ? (row.nextPayload as Record<string, unknown>) : {}
    const path = typeof o.path === 'string' && o.path ? o.path : '(ruta no informada en el registro)'
    const status = typeof o.statusCode === 'number' ? o.statusCode : 0
    const httpSections = explainHttp(row, path, status)
    const fullJson = safeStringify(row.nextPayload ?? {})
    return { sections: httpSections, fullJson }
  }

  const sections = explainDomain(row) // incluye enrichDomainSections al final
  const fullObj: Record<string, unknown> = {
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    nextPayload: row.nextPayload,
  }
  if (row.previousPayload !== undefined) fullObj.previousPayload = row.previousPayload
  if (row.reason) fullObj.reason = row.reason
  return { sections, fullJson: safeStringify(fullObj) }
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function auditDetailModalTitle(row: AuditRowForDetail): string {
  return auditActionTitleEs(row.action)
}

/** Línea secundaria bajo el título del modal (tipo de entidad en lenguaje claro). */
export function auditDetailModalSubtitle(row: AuditRowForDetail): string {
  return auditEntityTitleEs(row.entityType)
}
