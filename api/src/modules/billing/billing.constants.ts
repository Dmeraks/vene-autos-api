/**
 * Constantes compartidas por el módulo de facturación (Fase 4).
 *
 * Mantenerlas en un único sitio simplifica búsquedas de auditoría y asegura que
 * seeders, servicios y controllers coincidan en los códigos de `referenceType`
 * que almacenamos en auditoría / futuros movimientos.
 */

/** Tipo de entidad que registra auditoría para resoluciones fiscales. */
export const AUDIT_FISCAL_RESOLUTION_ENTITY = 'FiscalResolution' as const;

/** Tipo de entidad que registra auditoría para facturas. */
export const AUDIT_INVOICE_ENTITY = 'Invoice' as const;

/** Tipo de entidad que registra auditoría para notas crédito. */
export const AUDIT_CREDIT_NOTE_ENTITY = 'CreditNote' as const;

/** Tipo de entidad que registra auditoría para notas débito (Fase 7). */
export const AUDIT_DEBIT_NOTE_ENTITY = 'DebitNote' as const;

/**
 * Claves de configuración (`WorkshopSetting.key`) que consume el motor fiscal.
 * Mantener alineadas con `SettingsService.assertDianSettingValue`.
 */
export const BILLING_SETTING_KEYS = {
  dianEnabled: 'dian.enabled',
  dianProvider: 'dian.provider',
  dianEnvironment: 'dian.environment',
  dianEmissionMode: 'dian.emission_mode',
  dianApiBaseUrl: 'dian.api_base_url',
  dianApiToken: 'dian.api_token',
  dianCompanyNit: 'dian.company_nit',
  dianCompanyVerificationDigit: 'dian.company_verification_digit',
  /** Estilo de comprobante impreso cuando DIAN está apagado: `ticket` (default) o `invoice`. */
  billingReceiptStyle: 'billing.receipt_style',
} as const;

/** Permisos del módulo facturación (Fase 4). Declarados en seed y usados en guards. */
export const BILLING_PERMISSIONS = {
  fiscalResolutionsRead: 'fiscal_resolutions:read',
  fiscalResolutionsManage: 'fiscal_resolutions:manage',
  invoicesRead: 'invoices:read',
  invoicesCreate: 'invoices:create',
  invoicesIssue: 'invoices:issue',
  invoicesVoid: 'invoices:void',
  invoicesRecordPayment: 'invoices:record_payment',
  creditNotesRead: 'credit_notes:read',
  creditNotesCreate: 'credit_notes:create',
  creditNotesIssue: 'credit_notes:issue',
  creditNotesVoid: 'credit_notes:void',
  debitNotesRead: 'debit_notes:read',
  debitNotesCreate: 'debit_notes:create',
  debitNotesIssue: 'debit_notes:issue',
  debitNotesVoid: 'debit_notes:void',
  dianManageDispatch: 'dian:manage_dispatch',
} as const;
