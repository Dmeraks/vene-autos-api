/**
 * Contrato abstracto del proveedor de facturación electrónica DIAN.
 *
 * Este contrato se mantiene **estable** aunque cambiemos de proveedor
 * (Facture, Alegra, Siigo, Carvajal, o integración propia con DIAN):
 * cambiamos solo la implementación concreta detrás de `DianProviderFactory`.
 *
 * Fase 4: solo existe `NoopDianProvider` — retorna `NOT_CONFIGURED`. El resto
 * del sistema debe poder operar (crear Invoice en DRAFT, mostrar cola, etc.)
 * sin tener un proveedor real, para mantener al taller operativo como persona
 * natural y migrarlo a persona jurídica activando la bandera y registrando
 * credenciales cuando corresponda.
 */
export type DianSubmitResult =
  | {
      status: 'ACCEPTED';
      externalId: string;
      cufe: string;
      provider: string;
      environment: string;
      response?: unknown;
    }
  | {
      status: 'REJECTED';
      externalId?: string;
      errorMessage: string;
      provider: string;
      environment: string;
      response?: unknown;
    }
  | {
      status: 'ERROR';
      errorMessage: string;
      provider: string;
      environment: string;
      response?: unknown;
    }
  | {
      status: 'NOT_CONFIGURED';
      errorMessage: string;
    };

/** Carga útil genérica que el servicio envía al proveedor. Forma pragmática, no UBL crudo todavía. */
export type DianInvoicePayload = {
  documentNumber: string;
  invoiceNumber: number;
  prefix: string;
  resolutionNumber: string;
  kind: 'ELECTRONIC_INVOICE' | 'POS' | 'CONTINGENCY';
  issuedAt: string;
  customer: {
    name: string;
    documentId: string | null;
    phone: string | null;
    email: string | null;
  };
  currency: 'COP';
  totals: {
    subtotal: string;
    totalDiscount: string;
    totalTax: string;
    totalVat: string;
    totalInc: string;
    grandTotal: string;
  };
  lines: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    taxRatePercent: string;
    taxKind: 'VAT' | 'INC' | null;
    lineTotal: string;
    taxAmount: string;
  }>;
  notes?: string | null;
};

export type DianCreditNotePayload = {
  documentNumber: string;
  creditNoteNumber: number;
  prefix: string;
  resolutionNumber: string;
  reason: 'VOID' | 'ADJUSTMENT' | 'RETURN' | 'DISCOUNT';
  reasonDescription: string;
  relatedInvoice: {
    documentNumber: string;
    cufe: string | null;
  };
  issuedAt: string;
  totals: {
    subtotal: string;
    totalDiscount: string;
    totalTax: string;
    grandTotal: string;
  };
  lines: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    taxRatePercent: string;
    taxKind: 'VAT' | 'INC' | null;
    lineTotal: string;
    taxAmount: string;
  }>;
};

export type DianDebitNotePayload = {
  documentNumber: string;
  debitNoteNumber: number;
  prefix: string;
  resolutionNumber: string;
  reason: 'PRICE_CORRECTION' | 'ADDITIONAL_CHARGE' | 'INTEREST' | 'OTHER';
  reasonDescription: string;
  relatedInvoice: {
    documentNumber: string;
    cufe: string | null;
  };
  issuedAt: string;
  totals: {
    subtotal: string;
    totalDiscount: string;
    totalTax: string;
    grandTotal: string;
  };
  lines: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    taxRatePercent: string;
    taxKind: 'VAT' | 'INC' | null;
    lineTotal: string;
    taxAmount: string;
  }>;
};

export interface DianProvider {
  /** Identificador humano del proveedor (ej. "facture", "noop"). */
  readonly name: string;
  /** `sandbox` o `production`; se persiste en la factura cuando es aceptada. */
  readonly environment: string;

  submitInvoice(payload: DianInvoicePayload): Promise<DianSubmitResult>;
  submitCreditNote(payload: DianCreditNotePayload): Promise<DianSubmitResult>;
  submitDebitNote(payload: DianDebitNotePayload): Promise<DianSubmitResult>;
}
