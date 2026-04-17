# Fase 6 — Accesibilidad SaaS (oscuro), responsive y QA

Tema: `html.va-panel-theme-saas-light` + clase `dark` en `html`. Objetivo: **WCAG 2.1 AA** en textos y controles frecuentes, layout usable en **móvil / tablet / escritorio**, y cierre de QA reproducible.

---

## 0. Mapa de etapas (código → cierre)

Las fases **0, 2 y 5** están referenciadas en comentarios de `web/src/index.css` (tokens, shell, superficies reutilizables). La **Fase 6** es este documento: medición y QA manual.

| Etapa | Dónde vive | Qué significa “100%” |
|-------|------------|----------------------|
| **0** | `html.va-panel-theme-saas-light` en `index.css` (`--va-surface-*`, `--va-accent-soft`, `brand-*`) | Tokens y fondos claro/oscuro definidos y usados por el tema. |
| **2** | `AppShell.tsx` + reglas `.va-app-shell-*` bajo `va-panel-theme-saas-light` | Layout sidebar/header/subnav/pie; píldora de subnav y enlaces sin que utilidades Tailwind pisen las reglas del tema (mismo lenguaje visual que pestañas activas). |
| **5** | Clases `va-saas-*`, `.va-saas-tab-strip`, overrides de `.va-tabstrip` en `index.css` | Tarjetas, héroes de página y pestañas alineadas al acento suave del shell. |
| **6** | Secciones **1–3** de este archivo | Responsive R1–R7, Lighthouse/axe, regresión visual y firma de §3. |

**Cierre por etapa (marcar al validar):**

- [ ] **Etapa 0** — Revisión visual rápida claro/oscuro con tema SaaS (sin regresiones de color en lienzo principal).
- [ ] **Etapa 2** — Sidebar en `lg` y superior, header con búsqueda y toolbar, subnav horizontal cuando el aside está oculto, pie; modo oscuro legible (meta, iconos, enlaces inactivos).
- [ ] **Etapa 5** — Caja, Config, OT e Informes: tabs y bloques `va-saas-*` coherentes con el shell.
- [ ] **Etapa 6** — Todos los ítems de **§3 QA cerrado** y checklist **§1** completos.

Las etapas **0 / 2 / 5** pueden considerarse listas en código cuando `npm run build` pasa y no hay issues abiertos de UI del tema; la **etapa 6** exige además las pruebas manuales y herramientas de §2–§3.

---

## 1. Checklist responsive (manual)

Marcar en cada viewport tras `npm run dev` (o build de preview) con **DevTools → dimensiones** o dispositivo real.

| # | Criterio | ≤ 390px | 768px | ≥ 1280px |
|---|-----------|:---:|:---:|:---:|
| R1 | Sidebar: colapsa / drawer accesible sin perder foco ni tap targets &lt; 44px | ☐ | — | ☐ |
| R2 | `AppShell` header: búsqueda y menú usuario no se solapan; texto truncado con `title` donde aplique | ☐ | ☐ | ☐ |
| R3 | Tablas (`va-table-scroll`): scroll horizontal visible, cabecera legible, sin celdas cortadas sin scroll | ☐ | ☐ | ☐ |
| R4 | Pestañas (`va-tabstrip`, `va-saas-tab-strip`): scroll horizontal en móvil si hay muchas tabs; activo visible | ☐ | ☐ | ☐ |
| R5 | Formularios largos (OT, Config, Caja): botones primarios alcanzables al final del flujo sin zoom | ☐ | ☐ | ☐ |
| R6 | Modales (`va-modal-overlay`): panel no mayor que viewport; cierre por overlay, botón y **Escape** | ☐ | ☐ | ☐ |
| R7 | Página pública consulta OT: formulario usable, mensajes de error dentro del viewport | ☐ | ☐ | — |

**Cierre responsive:** todas las celdas ☐ → ☑ en al menos un navegador objetivo (p. ej. Chrome + Safari iOS si aplica).

---

## 2. WCAG 2.1 — medición (herramienta + referencia de tokens)

### 2.1 Cómo medir (obligatorio antes de “QA cerrado”)

1. **Chrome DevTools → Lighthouse → Accessibility** (modo oscuro activado en la app).
2. **axe DevTools** (extensión): ejecutar scan en rutas: `/`, `/caja`, `/ordenes`, `/ordenes/:id`, `/admin/configuracion`, `/admin/auditoria`, `/consultar-ot`.
3. Contraste puntual: **DevTools → seleccionar nodo → estilo computado → contraste** (Chrome muestra ratio AA/AAA para texto).

### 2.2 Pares revisados en Fase 6 (oscuro SaaS)

Referencias aproximadas (Tailwind / CSS) tras ajustes en `index.css` (texto secundario **slate-300** sobre lienzo **#020617**, bordes **slate-600** sobre tarjetas **slate-900**):

| Uso | Primer plano | Fondo | Ratio orientativo AA cuerpo (4.5:1) |
|-----|----------------|-------|--------------------------------------|
| Cuerpo principal | `text-slate-100` | `--va-surface-page` `#020617` | Cumple |
| Meta cabecera / nav inactiva | `text-slate-300` | `#020617` / `slate-950` | Cumple |
| Descripción bajo título (`.va-page-desc`) | `text-slate-300` | `#020617` | Cumple |
| Placeholder campo (`.va-field`) | `text-slate-400` | `slate-800` | Verificar en Lighthouse; subir a `slate-300` si falla |
| Cabecera tabla (`.va-table-head-row`) | `text-slate-200` | `slate-800/55` | Cumple |

**Nota:** los ratios exactos dependen del color de fondo real de la celda (opacidades). La fuente de verdad es **Lighthouse + axe** sobre la build desplegada.

---

## 3. QA cerrado (definición de hecho)

- [ ] **Build:** `cd web && npm run build` sin errores.
- [ ] **Tema:** Probar **SaaS claro** en claro y oscuro (`ThemeToggle` + recarga si hace falta).
- [ ] **Checklist §1:** todas las filas marcadas en viewports indicados.
- [ ] **§2:** Lighthouse Accesibilidad ≥ **90** en `/` y `/caja` (ajustar umbral de equipo si la política es distinta); axe **0 violaciones críticas**.
- [ ] **Regresión visual rápida:** Caja (tabs + tabla), Órdenes (lista + detalle), Config (secciones), Auditoría (filtros + modal detalle).

**Firma cierre (rellenar):**

- Fecha: _______________
- Entorno (dev / staging / prod): _______________
- Responsable: _______________
