-- Tema de panel: solo saas_light / vene_autos. Normalizar legado.
UPDATE "workshop_settings"
SET "value" = to_jsonb('saas_light'::text)
WHERE "key" = 'ui.panel_theme'
  AND (
    "value" = to_jsonb('standard'::text)
    OR "value" = to_jsonb('commercial'::text)
  );
