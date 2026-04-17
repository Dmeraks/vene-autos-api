-- Consentimiento y firma del cliente en la orden de trabajo
ALTER TABLE "work_orders" ADD COLUMN "client_consent_text_snapshot" TEXT,
ADD COLUMN "client_consent_signed_at" TIMESTAMP(3),
ADD COLUMN "client_signature_png_base64" TEXT;
