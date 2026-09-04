# Checklist deploy (BD · API · front · permisos)

## 1. Git

```powershell
cd "G:\Vene Autos"
git status
git add .
git commit -m "mensaje corto del cambio"
git push
```

## 2. BD local (desarrollo)

```powershell
cd "G:\Vene Autos\api"
npx prisma migrate dev --name describe_el_cambio
```

Si solo cambió `seed.ts` / catálogo de permisos (sin nueva migración):

```powershell
npx prisma db seed
```

## 3. Producción — migraciones

Con la URI de Postgres de producción (misma que usa el API):

```powershell
cd "G:\Vene Autos\api"
$env:DATABASE_URL="postgresql://..."
npx prisma migrate deploy
```

## 4. Producción — seed (permisos / datos de catálogo)

Solo si agregás o tocás permisos en `seed.ts` u otro catálogo que cargue el seed:

```powershell
cd "G:\Vene Autos\api"
$env:DATABASE_URL="postgresql://..."
npx prisma db seed
```

## 5. Desplegar servicios

- **API:** redeploy en el hosting para que arranque el último código con el mismo `DATABASE_URL`.
- **Front:** redeploy en Vercel u host del SPA; revisar **`VITE_API_BASE`** apuntando al API público.

## 6. Después del seed en producción

Cerrar sesión en el panel y volver a entrar (o usar ventana privada).

---

**Regla rápida:** `migrate deploy` = esquema · `db seed` en prod = filas de permisos/catálogo cuando el código lo exige · Supabase no despliega código; Vercel/host sí.
