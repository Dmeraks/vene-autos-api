import { Module } from '@nestjs/common';
import { DianProviderFactory } from '../../common/dian/dian-provider.factory';
import { NotesPolicyModule } from '../../common/notes-policy/notes-policy.module';
import { AuditModule } from '../audit/audit.module';
import { CreditNotesController } from './credit-notes.controller';
import { CreditNotesService } from './credit-notes.service';
import { DebitNotesController } from './debit-notes.controller';
import { DebitNotesService } from './debit-notes.service';
import { DianDispatchController } from './dian-dispatch.controller';
import { DianDispatchService } from './dian-dispatch.service';
import { FiscalResolutionsController } from './fiscal-resolutions.controller';
import { FiscalResolutionsService } from './fiscal-resolutions.service';
import { InvoiceNumberingService } from './invoice-numbering.service';
import { InvoicePaymentsService } from './invoice-payments.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

/**
 * Módulo de facturación electrónica DIAN (Fase 4, preparación).
 *
 * Por diseño queda inactivo hasta que el taller:
 *  1) registre al menos una FiscalResolution activa (endpoint Admin),
 *  2) active `dian.enabled=true` y configure el proveedor en Configuración.
 *
 * Hasta entonces el sistema emite facturas solo en DRAFT (local) y la cola
 * de despacho registra cada intento como `NOT_CONFIGURED`.
 */
@Module({
  imports: [AuditModule, NotesPolicyModule],
  controllers: [
    FiscalResolutionsController,
    InvoicesController,
    CreditNotesController,
    DebitNotesController,
    DianDispatchController,
  ],
  providers: [
    FiscalResolutionsService,
    InvoicesService,
    InvoicePaymentsService,
    CreditNotesService,
    DebitNotesService,
    InvoiceNumberingService,
    DianDispatchService,
    DianProviderFactory,
  ],
  exports: [
    InvoicesService,
    CreditNotesService,
    DebitNotesService,
    InvoicePaymentsService,
  ],
})
export class BillingModule {}
