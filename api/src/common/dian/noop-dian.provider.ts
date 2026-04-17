import type {
  DianCreditNotePayload,
  DianDebitNotePayload,
  DianInvoicePayload,
  DianProvider,
  DianSubmitResult,
} from './dian-provider.interface';

/**
 * Proveedor DIAN "apagado": no envía nada, siempre responde `NOT_CONFIGURED`.
 *
 * Se usa cuando `dian.enabled=false` o cuando falta configuración obligatoria del proveedor.
 * Permite que el resto del sistema (emisión local en DRAFT, cola de despacho, UI) siga
 * funcionando sin lanzar errores; la factura simplemente queda pendiente de envío.
 */
export class NoopDianProvider implements DianProvider {
  readonly name = 'noop';
  readonly environment = 'sandbox';

  async submitInvoice(_payload: DianInvoicePayload): Promise<DianSubmitResult> {
    void _payload;
    return {
      status: 'NOT_CONFIGURED',
      errorMessage:
        'Facturación electrónica DIAN deshabilitada o proveedor no configurado. La factura queda en DRAFT hasta que se active el proveedor en Configuración.',
    };
  }

  async submitCreditNote(_payload: DianCreditNotePayload): Promise<DianSubmitResult> {
    void _payload;
    return {
      status: 'NOT_CONFIGURED',
      errorMessage:
        'Facturación electrónica DIAN deshabilitada o proveedor no configurado. La nota crédito queda en DRAFT hasta que se active el proveedor en Configuración.',
    };
  }

  async submitDebitNote(_payload: DianDebitNotePayload): Promise<DianSubmitResult> {
    void _payload;
    return {
      status: 'NOT_CONFIGURED',
      errorMessage:
        'Facturación electrónica DIAN deshabilitada o proveedor no configurado. La nota débito queda en DRAFT hasta que se active el proveedor en Configuración.',
    };
  }
}
