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
- **HTTP:** interceptor global para `POST`/`PUT`/`PATCH`/`DELETE` con cuerpo redactado. Desactivar con `AUDIT_HTTP=false`.

## Estructura

- `src/modules/*` — módulos de dominio (auth, users, roles, permissions, audit, settings).
- `src/common/*` — guards (`JwtAuthGuard`, `PermissionsGuard`), interceptor de auditoría HTTP, utilidades.
- `prisma/schema.prisma` — modelo relacional estable para crecer en fases siguientes.
