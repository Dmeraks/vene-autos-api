# Vene Autos — API (Fase 4 — clientes y vehículos)

Repositorio remoto recomendado en GitHub: **`vene-autos-api`** (mismo nombre que el paquete npm `vene-autos-api`), por ejemplo `https://github.com/TU_USUARIO/vene-autos-api`.

Backend NestJS + PostgreSQL + Prisma. Incluye autenticación JWT, **RBAC granular** (`recurso:acción`), **auditoría** (dominio + HTTP opcional), configuración del taller por claves JSON y CI básico.

## Requisitos

- Node.js 20+
- Docker (opcional, para PostgreSQL)

## Puesta en marcha

1. Copiar variables de entorno:

   ```bash
   cp .env.example .env
   ```

   Definir `JWT_SECRET` (cadena larga y aleatoria).

2. Base de datos:

   ```bash
   docker compose up -d
   npx prisma migrate dev --name phase1_init
   npx prisma db seed
   ```

3. Arranque en desarrollo:

   ```bash
   npm install
   npm run start:dev
   ```

- Salud: `GET http://localhost:3000/api/v1/health`
- Login: `POST /api/v1/auth/login` con `{ "email", "password" }`

Credenciales por defecto del seed (cambiar en producción): ver `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` en `.env.example`.

## Permisos (Fase 1)

Formato: `recurso:acción`. Ejemplos: `users:read`, `settings:update`, `audit:read`.

Los roles `administrador` y `cajero` vienen del seed; el administrador tiene todos los permisos del catálogo Fase 1.

## Auditoría

- **Dominio:** creación/actualización de usuarios, roles, login, ajustes de configuración (antes/después en JSON).
- **HTTP:** middleware global que, al cerrar la respuesta (`finish`), registra `POST`/`PUT`/`PATCH`/`DELETE` con el código HTTP final y cuerpo redactado (incluye 4xx/5xx y rechazos de guard). Desactivar con `AUDIT_HTTP=false`.

## Política de notas y panel

Hay **dos** mínimos configurables en `workshop_settings` (enteros 5–500, tras `trim` en validación): `notes.min_length_chars` (**general**: caja, solicitudes y su revisión, recepción de compra, etc.; seed **50**) y `notes.min_length.work_order_payment` (**solo cobros en OT**; seed **70**). Si falta una fila en base, el API usa esos mismos valores como respaldo. Detalle y mantenimiento: **`docs/NOTAS_POLITICA.md`**.

`GET /api/v1/settings/ui-context` devuelve `{ "notesMinLengthChars", "notesMinLengthWorkOrderPayment" }` para formularios sin requerir `settings:read`. El mapa completo sigue en `GET /api/v1/settings` y los cambios en `PATCH /api/v1/settings`.

## Estructura

- `src/modules/*` — módulos de dominio (auth, users, roles, permissions, audit, settings).
- `src/common/*` — guards (`JwtAuthGuard`, `PermissionsGuard`), middleware de auditoría HTTP, utilidades.
- `prisma/schema.prisma` — modelo relacional estable para crecer en fases siguientes.
