# Primer paso: base de datos y API (Vene Autos)

Guía breve para cuando tengas **PostgreSQL** y quieras dejar el API funcionando en tu PC o en un servidor.

Visión de producto (cliente, vehículo, inventario futuro, fiscal): **`docs/VISION_PRODUCTO.md`**.

## 1. Requisitos

- **Node.js** (LTS recomendado).
- **PostgreSQL** 14+ (local o en la nube).
- Opcional: **Docker** si usáis el `docker-compose` del proyecto para levantar solo la base.

## 2. Variables de entorno

1. Copiá `api/.env.example` a `api/.env`.
2. Editá al menos:
   - **`DATABASE_URL`**: cadena de conexión a tu base (usuario, contraseña, host, puerto, nombre de base).
   - **`JWT_SECRET`**: texto largo y aleatorio en producción.
3. El resto (CORS, `TRUST_PROXY`, etc.) lo podés afinar después; en local suele bastar lo del ejemplo.

## 3. Crear la base (si no existe)

En el cliente SQL de PostgreSQL o por consola:

```sql
CREATE DATABASE vene_autos;
```

(Ajustá el nombre si en `DATABASE_URL` usás otro.)

## 4. Migraciones (tablas y reglas en la base)

**Importante:** el archivo `schema.prisma` está en **`api/prisma/`**. Si ejecutás `npx prisma` desde **`G:\Vene Autos`** (solo la raíz), Prisma **no** encuentra el esquema y puede intentar instalarse solo (versión incorrecta).

**Opción A — desde la carpeta `api` (recomendado):**

```bash
cd api
npm install
npx prisma migrate deploy
```

**Opción B — desde la raíz `Vene Autos`** (usa el `package.json` de la raíz):

```bash
npm run api:install
npm run db:migrate
```

- En **desarrollo** (cuando generás migraciones nuevas) a veces se usa `cd api && npx prisma migrate dev`.
- Si Windows devuelve **EPERM** al generar el cliente de Prisma, **pará** el servidor (`npm run start:dev`), ejecutá `npm run db:generate` desde la raíz (o `cd api && npx prisma generate`) y volvé a levantar el API.

## 5. Datos iniciales (roles, permisos, admin, configuración)

```bash
cd api
npx prisma db seed
```

Desde la raíz del repo:

```bash
npm run db:seed
```

Quedará un usuario administrador (email y contraseña según `.env` / ejemplo; cambiá la contraseña en producción).

## 6. Arrancar el API

```bash
npm run start:dev
```

Por defecto escucha en **http://localhost:3000** y las rutas van bajo **`/api/v1`** (ej.: `GET /api/v1/health`).

## 7. Probar login (ejemplo PowerShell)

```powershell
$body = '{"email":"admin@veneautos.local","password":"ChangeMe!123"}'
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/login" -Method Post -Body $body -ContentType "application/json"
$r.accessToken
```

Luego podés llamar otros endpoints con cabecera:

`Authorization: Bearer <accessToken>`

## 8. Enlazar caja con una orden de trabajo

Al crear un **ingreso** o **egreso** (`POST .../cash/movements/income` o `.../expense`), podés enviar en el JSON:

- **`workOrderId`**: UUID de la orden (`GET /work-orders` o `GET /work-orders/:id`).

El sistema guardará la referencia estándar en el movimiento de caja para trazabilidad. No mezcléis ese campo con otro `referenceType` distinto.

## 9. Cobros en la orden de trabajo (recomendado)

Para registrar un cobro **desde la OT** (crea el ingreso en caja y la fila de cobro en una sola operación):

- **`POST /api/v1/work-orders/:id/payments`** con cuerpo JSON, por ejemplo:
  - `amount` (obligatorio): string con monto, ej. `"50000"` o `"50000.50"`.
  - `note` (opcional).
  - `categorySlug` (opcional): por defecto `ingreso_cobro` (debe ser categoría de **ingreso** existente).

Requisitos habituales: sesión de caja **abierta**, permisos **`work_orders:record_payment`** y **`cash_movements:create_income`**, y la OT no cancelada. Si la OT tiene **`authorizedAmount`**, el total cobrado no puede superarlo.

Consultas útiles:

- **`GET /api/v1/work-orders/:id`** — incluye un objeto **`paymentSummary`** (`paymentCount`, `totalPaid`, `remaining` si hay tope).
- **`GET /api/v1/work-orders/:id/summary`** — mismo tipo de totales en un endpoint dedicado.
- **`GET /api/v1/work-orders/:id/payments`** — listado de cobros.

En alta o edición de la OT podés enviar **`authorizedAmount`** (tope opcional); en `PATCH`, `null` quita el tope.

## 10. Tests y CI

En la carpeta **`api`**:

```bash
npm test
npm run lint
```

En GitHub, creá el repositorio con el nombre **`vene-autos-api`** (convención clara: es solo el backend). Enlazá tu carpeta local con `git remote add origin https://github.com/TU_USUARIO/vene-autos-api.git` (o `git remote set-url` si ya existía `origin`).

Si el repositorio Git incluye la raíz **`Vene Autos`** (carpeta `api` dentro), GitHub Actions ejecuta lint, build y tests al subir cambios bajo `api/` (workflow `.github/workflows/ci.yml`). Conviene Node **20 LTS** (`nvm use` / `fnm use` leyendo `api/.nvmrc`).

## 11. Clientes, vehículos y OT enlazadas (fase 4)

- **Clientes:** `POST/GET/PATCH /api/v1/customers` (permisos `customers:*`).
- **Vehículos:** `POST /api/v1/vehicles` con `customerId`, `plate`, etc.; `GET/PATCH /api/v1/vehicles/:id` (`vehicles:*`).
- **Vehículos del cliente:** `GET /api/v1/customers/:id/vehicles`.
- **Historial por vehículo:** `GET /api/v1/vehicles/:id/work-orders` (requiere `work_orders:read`).
- **OT:** en `POST/PATCH /work-orders` podés enviar `vehicleId` (UUID); `null` en `PATCH` quita el vínculo sin borrar textos viejos. Listado: `GET /work-orders?vehicleId=...`.

**Migración de datos viejos** (OT con placa en texto, sin `vehicle_id`): con respaldo de BD,

```bash
npm run backfill:legacy-vehicles
```

Agrupa por placa normalizada, crea un cliente y un vehículo por grupo y enlaza las OT. Luego ejecutá `npx prisma db seed` si agregaste permisos nuevos en otra máquina.

---

Si algo falla, anotá el mensaje de error completo y el comando que ejecutaste; con eso se puede acotar el siguiente paso.
