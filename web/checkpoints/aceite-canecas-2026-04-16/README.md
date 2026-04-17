# Checkpoint — canecas Aceite (2026-04-16)

Copia de seguridad del medidor de canecas (animación, `clip-path` ondulado, página `/aceite` con varias canecas, layout y util de detección).

## Restaurar (“Regresa las canecas a como estaban”)

Desde la raíz del repo `Vene Autos`, en PowerShell:

```powershell
$base = "web/checkpoints/aceite-canecas-2026-04-16/snapshot"
Copy-Item "$base/OilDrumGauge.tsx" "web/src/components/aceite/OilDrumGauge.tsx" -Force
Copy-Item "$base/AceitePage.tsx" "web/src/pages/AceitePage.tsx" -Force
Copy-Item "$base/oilDrumInventory.ts" "web/src/utils/oilDrumInventory.ts" -Force
```

Las imágenes siguen en `web/public/caneca-aceite-llena.png` y `web/public/caneca-aceite-vacia.png` (no se duplican aquí).

## Archivos en `snapshot/`

| Archivo original |
|------------------|
| `web/src/components/aceite/OilDrumGauge.tsx` |
| `web/src/pages/AceitePage.tsx` |
| `web/src/utils/oilDrumInventory.ts` |
