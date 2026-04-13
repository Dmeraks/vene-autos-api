/** Textos para la UI; las claves técnicas siguen siendo las del API. */
export type SettingFieldPresentation = {
  label: string
  description: string
}

const META: Record<string, SettingFieldPresentation> = {
  'auth.session_idle_timeout_minutes': {
    label: 'Tiempo máximo de inactividad (minutos)',
    description:
      'Si el usuario no hace nada en el panel durante este tiempo, la sesión se cierra sola. Útil en PCs compartidos del taller. Valor entre 1 y 1440 (24 h).',
  },
  'users.create_requires_dueno_role': {
    label: 'Solo el rol dueño puede crear usuarios',
    description:
      'Si está en “Sí”, únicamente quien tenga el rol de dueño puede dar de alta cuentas nuevas. Si está en “No”, quien tenga permiso de usuarios puede crearlas según roles.',
  },
  'users.create_requires_owner_role': {
    label: 'Solo el rol dueño puede crear usuarios',
    description: 'Misma política que la clave anterior (nombre alternativo en algunos entornos).',
  },
  'workshop.currency': {
    label: 'Moneda del taller',
    description:
      'Código de moneda que usa el taller en textos y reportes (por ejemplo COP, USD, EUR). Debe coincidir con lo que manejan en facturación.',
  },
  'workshop.name': {
    label: 'Nombre del taller',
    description: 'Nombre que verá el personal en pantallas y mensajes del sistema.',
  },
  'workshop.timezone': {
    label: 'Zona horaria',
    description:
      'Zona IANA (por ejemplo America/Bogota, America/Caracas) para fechas y auditoría. Debe coincidir con el reloj del negocio.',
  },
  'notes.min_length_chars': {
    label: 'Mínimo de caracteres — notas operativas generales',
    description:
      'Aplica a: apertura de caja, ingresos/egresos, solicitud de egreso, aprobación/rechazo de solicitudes, recepción de compra y nota de diferencia en arqueo (si aplica). Entero 5–500. Valor por defecto en bases nuevas: 50. Mantenimiento: `api/docs/NOTAS_POLITICA.md`.',
  },
  'notes.min_length.work_order_payment': {
    label: 'Mínimo de caracteres — nota de cobro en orden de trabajo',
    description:
      'Solo para el texto al registrar un cobro vinculado a una OT (mayor detalle que un movimiento de caja genérico). Entero 5–500. Por defecto 70. Si tu base es antigua, esta fila puede crearse al guardar Configuración o con `npx prisma db seed`. Ver `api/docs/NOTAS_POLITICA.md`.',
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
