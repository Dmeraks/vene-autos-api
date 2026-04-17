import { ClientConsentSignedPanel } from './ClientConsentSignedPanel'
import { ClientConsentSignerCore } from './ClientConsentSignerCore'

type Props = {
  workOrderId: string
  /** Orden cerrada: solo lectura de lo ya firmado */
  disabled: boolean
  signedAt: string | null
  consentSnapshot: string | null
  signaturePngBase64: string | null
  canRecord: boolean
  onRecorded: () => void
}

export function ClientConsentSignatureSection({
  workOrderId,
  disabled,
  signedAt,
  consentSnapshot,
  signaturePngBase64,
  canRecord,
  onRecorded,
}: Props) {
  const signed = Boolean(signedAt && signaturePngBase64)

  return (
    <section className="va-card">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Consentimiento del cliente</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
        El cliente firma con el dedo en tablet o celular (o con el mouse en PC). Solo se puede registrar{' '}
        <strong className="text-slate-700 dark:text-slate-200">una vez</strong> por orden.
      </p>

      {signed ? (
        <div className="mt-4">
          <ClientConsentSignedPanel
            signedAt={signedAt!}
            consentSnapshot={consentSnapshot}
            signaturePngBase64={signaturePngBase64!}
            density="compact"
          />
        </div>
      ) : disabled ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-300">Esta orden está cerrada; no se puede firmar.</p>
      ) : !canRecord ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-300">
          No tenés permiso para registrar la firma en esta orden.
        </p>
      ) : (
        <div className="mt-4">
          <ClientConsentSignerCore workOrderId={workOrderId} onSuccess={onRecorded} />
        </div>
      )}
    </section>
  )
}
