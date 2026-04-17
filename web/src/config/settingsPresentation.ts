/** Textos para la UI; las claves técnicas siguen siendo las del API. */
export type SettingFieldPresentation = {
  label: string
  description: string
}

const META: Record<string, SettingFieldPresentation> = {
  'auth.session_idle_timeout_minutes': {
    label: 'Tiempo máximo de inactividad (minutos)',
    description: 'Tras este tiempo sin actividad se cierra la sesión. Rango 1–1440 (minutos).',
  },
  'users.create_requires_dueno_role': {
    label: 'Solo el rol dueño puede crear usuarios',
    description: 'Si es “Sí”, solo el dueño da de alta usuarios; si “No”, quien tenga permiso de usuarios.',
  },
  'users.create_requires_owner_role': {
    label: 'Solo el rol dueño puede crear usuarios',
    description: 'Alias de la política anterior en algunas bases.',
  },
  'workshop.currency': {
    label: 'Moneda del taller',
    description: 'Código en textos y reportes (p. ej. COP, USD).',
  },
  'workshop.name': {
    label: 'Nombre del taller',
    description: 'Se muestra en pantallas y mensajes del sistema.',
  },
  'workshop.timezone': {
    label: 'Zona horaria',
    description: 'IANA (p. ej. America/Bogota) para fechas y auditoría.',
  },
  'ui.panel_theme': {
    label: 'Tema visual del panel del taller',
    description:
      'Estándar: panel clásico. Comercial: estética web pública. SaaS claro: dashboard moderno (Inter, sidebar, más ancho). El tema claro/oscuro sigue disponible.',
  },
  'notes.min_length_chars': {
    label: 'Mínimo de caracteres — notas operativas generales',
    description: 'Caja, egresos, recepción de compra, arqueo, etc. Entero 5–500 (por defecto 50 en bases nuevas).',
  },
  'notes.min_length.work_order_payment': {
    label: 'Mínimo de caracteres — nota de cobro en orden de trabajo',
    description: 'Solo la nota al registrar un cobro en una OT. Entero 5–500 (por defecto 70).',
  },
  'dian.enabled': {
    label: 'Activar facturación electrónica DIAN',
    description:
      'Si “No”, el taller opera sin emisión electrónica (valor por defecto). Cuando el proveedor esté integrado y probado, cambiá a “Sí”.',
  },
  'dian.provider': {
    label: 'Proveedor DIAN',
    description:
      'Proveedor tecnológico autorizado (Facture, Alegra, Siigo, Carvajal o integración propia). No emite facturas con solo cambiar el valor: requiere credenciales y activación.',
  },
  'dian.environment': {
    label: 'Ambiente DIAN',
    description: 'Usá “sandbox” para pruebas habituales y “production” solo una vez validado el set de pruebas.',
  },
  'dian.emission_mode': {
    label: 'Modo de emisión',
    description:
      'async = el POS no bloquea al cliente; la factura se envía en cola. sync = emisión directa (solo si el proveedor responde rápido).',
  },
  'dian.api_base_url': {
    label: 'URL base del proveedor',
    description: 'Endpoint HTTPS que expone el proveedor para emitir y consultar documentos (consultá su documentación).',
  },
  'dian.api_token': {
    label: 'Token / API key del proveedor',
    description: 'Se guarda cifrado en base. Rotá el valor cuando el proveedor lo indique; nunca lo compartas por canales abiertos.',
  },
  'dian.company_nit': {
    label: 'NIT del taller (emisor)',
    description: 'Solo dígitos, sin puntos ni guion. Debe coincidir con el que está dado de alta ante la DIAN.',
  },
  'dian.company_verification_digit': {
    label: 'Dígito de verificación (DV)',
    description: 'Dígito del NIT del taller (0–9). Puede obtenerse en el RUT.',
  },
  'dian.resolution_number': {
    label: 'Número de resolución DIAN',
    description: 'Resolución vigente que autoriza la numeración de factura electrónica.',
  },
  'dian.resolution_prefix': {
    label: 'Prefijo de factura',
    description: 'Prefijo autorizado en la resolución (ej. FV, SETP).',
  },
  'dian.resolution_from': {
    label: 'Numeración desde',
    description: 'Primer consecutivo autorizado por la resolución vigente.',
  },
  'dian.resolution_to': {
    label: 'Numeración hasta',
    description: 'Último consecutivo autorizado por la resolución vigente.',
  },
  'dian.resolution_valid_until': {
    label: 'Resolución vigente hasta',
    description: 'Fecha tope de vigencia (YYYY-MM-DD). Renová antes del vencimiento para no interrumpir la emisión.',
  },
  'dian.test_set_id': {
    label: 'Test Set Id (habilitación)',
    description: 'Identificador del set de pruebas DIAN durante la habilitación. Queda vacío en producción normal.',
  },
}

export function getSettingPresentation(key: string): SettingFieldPresentation {
  return (
    META[key] ?? {
      label: key,
      description:
        'Parámetro avanzado guardado en base. Si no estás seguro del valor, consultá con quien administró el sistema o revisá la documentación del API.',
    }
  )
}
