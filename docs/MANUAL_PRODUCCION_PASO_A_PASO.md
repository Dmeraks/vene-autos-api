# Manual paso a paso: poner Vene Autos “en internet de verdad”

Este texto está escrito **sin tecnicismos**. Si un paso dice “copiá esto”, te digo **en qué pantalla está** y **qué es** en palabras normales.

Al terminar (si seguís todo en orden) deberías poder: abrir **www.veneautos.com.co** desde el celular de otra persona, entrar al panel y que los datos vivan en una base en la nube (no en tu PC).

---

## Parte 0 — Qué vas a usar y por qué (sin miedo)

Imaginá tres cajones:

1. **Supabase** = el **archivero de datos** (listas de clientes, órdenes, todo eso). En la práctica es una **base de datos en internet** que te dan ya armada. Vos solo necesitás la **“llave de entrada”** que ellos te muestran (una línea larga de texto).

2. **Railway** = el **motor** que hace funcionar el **programa del taller que corre en el servidor** (lo que en tu computadora es el “API” / la parte que guarda y busca datos). Railway te da una **dirección web** tipo `https://algo.up.railway.app` que es el “teléfono” donde el sitio del taller llama para hablar con el motor.

3. **Vercel** = la **ventanilla** que el público ve: la **pantalla del panel** (botones, menús). Vercel te da otra **dirección web**; después vos le pegás tu dominio **www.veneautos.com.co** encima para que la gente escriba eso y entre acá.

**Orden recomendado:** primero Supabase (datos) → después Railway (motor) → después Vercel (pantalla) → al final el dominio.

---

## Parte 1 — Cosas que tenés que tener antes de empezar

| Qué | Para qué | Dónde lo sacás |
|-----|-----------|----------------|
| Una cuenta de correo (Gmail sirve) | Para registrarte en las tres páginas | Ya la tenés |
| Tu dominio **www.veneautos.com.co** | Para que la gente escriba eso y entre al panel | Ya lo tenés; el “dueño” del dominio es donde lo compraste (GoDaddy, Namecheap, Cloudflare, etc.) |
| Acceso a **GitHub** donde está el código | Railway y Vercel se enganchan al código desde ahí | La misma cuenta/página donde subís el proyecto |
| Una **tarjeta** (a veces) | Supabase, Railway y Vercel tienen planes gratis con límites; si te piden tarjeta es para verificar que sos persona | Tu billetera |

Nada de esto “se programa”: son cuentas en páginas web.

---

## Parte 2 — Supabase (el archivero de datos)

### Paso 2.1 — Entrar y crear el “proyecto”

1. Abrí el navegador (Chrome, Edge, lo que sea).
2. Andá a la página **supabase.com**.
3. Arriba a la derecha: **Sign up** / **Registrarse** si no tenés cuenta, o **Log in** si ya tenés.
4. Cuando entres, buscá un botón tipo **“New project”** / **Nuevo proyecto**.
5. Te van a pedir:
   - **Nombre del proyecto:** poné algo que reconozcas, por ejemplo `veneautos-prod`.
   - **Contraseña de la base de datos:** inventá una **muy larga** y guardala en un papel o en el bloc de notas del celular **en un lugar seguro**. **Si la perdés, es un lío.** Esta contraseña no es la de tu usuario de Supabase: es **solo de la base de datos**.
   - **Región:** elegí la más cercana a Colombia si aparece (por ejemplo São Paulo o lo que te ofrezcan).
6. Confirmá / **Create project** y **esperá** a que termine de cargar (puede tardar uno o dos minutos).

### Paso 2.2 — Sacar la “llave de entrada” (la línea larga)

1. Con el proyecto ya creado, mirá el **menú izquierdo** de la página de Supabase.
2. Buscá un ícono de **engranaje** o la palabra **Settings** / **Configuración**.
3. Dentro de Settings, buscá algo que diga **Database** / **Base de datos**.
4. Ahí suele haber una sección **Connection string** / **Cadena de conexión** o **URI**.
5. Elegí la opción que diga **Node** o **Postgres** o **URI** (si hay varias, la que parezca “para programas”).
6. Vas a ver un **texto largo** que incluye la contraseña que inventaste antes (a veces dice `[YOUR-PASSWORD]` y vos tenés que reemplazar eso a mano con tu contraseña real).
7. **Copiá todo ese texto** y pegalo en un lugar seguro (Notas del teléfono, etc.). Eso en el mundo técnico se llama `DATABASE_URL`, pero acá lo llamamos **“la llave de Supabase”**.

**De dónde salió:** la genera Supabase en esa pantalla de configuración del proyecto. No la inventás vos letra por letra: la armás con lo que la página te muestra + tu contraseña de base.

### Paso 2.3 — Tablas vacías o con datos

Tu programa usa **tablas** que se crean con migraciones. Eso lo vas a correr **desde tu computadora** apuntando a esa llave, **o** alguien con acceso al código lo hace una sola vez después de conectar Railway. Si no entendés esto todavía: **no pasa nada**; lo importante es **ya tener copiada la llave** para el siguiente bloque.

---

## Parte 3 — Railway (el motor del taller en internet)

### Paso 3.1 — Entrar y enganchar el código

1. Andá a **railway.app** y creá cuenta / entrá.
2. **New project** / **Nuevo proyecto**.
3. Elegí algo como **“Deploy from GitHub”** / **Desplegar desde GitHub**.
4. Te va a pedir **permitir** que Railway vea tus repos: aceptá.
5. Elegí el repositorio donde está **Vene Autos** (el mismo que usás en Cursor).
6. **Muy importante:** cuando te pregunte la **carpeta** o **“Root Directory”**, tenés que poner la carpeta del **programa del servidor**, que en tu proyecto se llama **`api`** (tres letras: a, p, i). Si no ponés eso, Railway intenta levantar el proyecto entero y se rompe.

### Paso 3.2 — Decirle a Railway las “notas privadas” (variables)

**Dónde hacer clic (Railway):**

1. Entrá a **railway.app** y abrí el **proyecto** (la tarjeta o el nombre del proyecto).
2. Hacé clic en el **servicio** del API (suele tener el nombre del repo, por ejemplo `vene-autos-api`, o el ícono de GitHub).
3. Arriba vas a ver pestañas o un menú: buscá **Variables** (a veces dice **“Variables”** junto a *Deployments*, *Metrics*, *Settings*).
4. Ahí podés **“+ New Variable”** / **“Add Variable”** para cargar una por una, o **“RAW Editor”** para pegar varias líneas tipo `.env` de una sola vez.

Ahí vas a **pegar** cosas que el motor necesita para arrancar. Cada una es una **línea**: nombre a la izquierda, valor a la derecha. Lo mínimo en producción suele ser:

| Nombre (copiá exacto) | Qué valor poner |
|------------------------|-----------------|
| `DATABASE_URL` | La **llave larga** de Supabase (Paso 2.2), completa. |
| `JWT_SECRET` | Un texto **largo y aleatorio** (no uses el de ejemplo). Podés generar uno en un generador de “random string” y pegarlo. |
| `JWT_EXPIRES_IN` | Por ejemplo `12h` (igual que en tu `api/.env.example`). |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | La URL **exacta** del sitio donde corre el panel, por ejemplo `https://www.veneautos.com.co`. Si usás varios orígenes, separalos con **coma** y sin espacios raros. |
| `TRUST_PROXY` | `true` (recomendado detrás del proxy de Railway). |
| `HELMET_ENABLED` | `true` |
| `AUDIT_HTTP` | `true` o `false` según prefieras; en producción `true` es lo habitual. |
| `ALLOW_PUBLIC_REGISTRATION` | `false` salvo que quieras registro abierto. |

Opcional: si tu `api/.env` local tiene más claves, compará con **`api/.env.example`** en el repo: lo que figure ahí y uses en serio, copialo a Railway con el **mismo nombre**. **No subas** tu `.env` real a GitHub.

**De dónde sale cada valor:** de Supabase (`DATABASE_URL`), de tu cabeza o un generador (`JWT_SECRET`), y del resto de **`api/.env.example`** / tu `api/.env` local.

### Paso 3.3 — Cómo arranca el motor (build y start)

En Railway, en la configuración del servicio, suele haber:

- **Build command** = el comando que “compila” el programa (en muchos proyectos es `npm install` y después `npm run build` dentro de `api`).
- **Start command** = el comando que **deja el motor prendido** (muchas veces `npm run start:prod` o similar según el `package.json` de la carpeta `api`).

**De dónde sale:** del archivo **`package.json`** que está **dentro de la carpeta `api`** en el repo (sección `scripts`). Si no sabés cuál es, abrí ese archivo en Cursor y buscá la palabra `start` o `prod`.

### Paso 3.4 — Copiar la dirección pública del motor

1. Cuando el despliegue esté **verde** o diga **Running** / **En ejecución**, Railway te muestra una **URL**.
2. Copiala entera (empieza con `https://`).
3. Esa URL es el **“teléfono del motor”**. La vas a pegar en Vercel en el siguiente bloque.

**De dónde sale:** la genera Railway en la misma pantalla del servicio, suele decir **Domains** o **Public URL**.

---

## Parte 4 — Vercel (la pantalla del panel que ve el usuario)

### Paso 4.1 — Entrar y enganchar solo la carpeta **web**

1. Andá a **vercel.com** y creá cuenta / entrá.
2. **Add New** → **Project** / **Importar proyecto**.
3. Elegí el mismo repo de GitHub.
4. Cuando te pregunte la **carpeta raíz del proyecto** (**Root Directory**), poné **`web`** (no `api`, no la raíz del monorepo).
5. **Framework:** si te deja elegir, algo como **Vite** o “Other” está bien; Vercel muchas veces lo detecta solo.

### Paso 4.2 — La variable que conecta la pantalla con el motor

El sitio del taller necesita saber **a qué dirección llamar** para pedir datos.

**Dónde hacer clic (Vercel):**

1. Entrá a **vercel.com** y abrí el **proyecto** del front (el que tiene raíz **`web`**).
2. Arriba a la derecha o en el menú del proyecto: **Settings** / **Configuración** (ícono de engranaje).
3. En el menú **izquierdo** de Settings, buscá **Environment Variables** / **Variables de entorno**.
4. **Add New** / **Agregar**:  
   - **Name / Nombre:** `VITE_API_BASE` (**exactamente** así; es lo que usa este proyecto en `web/src/api/client.ts`).  
   - **Value / Valor:** la **URL pública de Railway** del Paso 3.4, completa, con `https://` al inicio (ej. `https://tu-servicio.up.railway.app`).  
   - Marcá al menos el entorno **Production** (y **Preview** si querés que los “preview deploy” también hablen con el mismo API).
5. Guardá (**Save**). Después, en la pestaña **Deployments**, abrí el último deploy y usá **Redeploy** / **⋯** → **Redeploy** para que el nuevo valor entre en el build (Vite “hornea” las variables al compilar).

**De dónde sale el valor:** de Railway. **Nombre correcto en este repo:** `VITE_API_BASE` (ver también `web/.env.example`).

### Paso 4.3 — Probar la dirección que te da Vercel

Antes de poner tu dominio propio, Vercel te da una dirección fea tipo `vene-autos-xxxx.vercel.app`.

1. Abrila en el navegador.
2. Si carga el login o el panel, **bien**. Si sale error en blanco o “no se puede conectar”, el problema casi siempre es: **la variable de la URL del motor mal escrita** o **el motor en Railway apagado / con error**.

---

## Parte 5 — Tu dominio www.veneautos.com.co

### Paso 5.1 — En Vercel: agregar el dominio

1. En el proyecto de Vercel: **Settings** → **Domains** / **Dominios**.
2. Escribí: `www.veneautos.com.co` y guardá.
3. Vercel te va a mostrar **instrucciones de DNS**: normalmente te dice “creá un registro **CNAME** que apunte a **cname.vercel-dns.com**” (o algo parecido; **copiá exacto lo que Vercel te diga**).

**De dónde sale:** de la pantalla de Vercel, no lo inventás.

### Paso 5.2 — En el lugar donde compraste el dominio

1. Entrá a la página donde compraste **veneautos.com.co** (GoDaddy, Namecheap, etc.).
2. Buscá **DNS** / **Zona DNS** / **Administrar DNS**.
3. Creá un registro nuevo:
   - **Tipo:** CNAME (si Vercel te lo pidió así).
   - **Nombre / Host:** `www` (muchas veces solo eso; a veces dice “subdominio”).
   - **Destino / apunta a:** lo que Vercel te copió (ej. `cname.vercel-dns.com`).
4. Guardá. **Puede tardar de minutos a horas** en funcionar en todo el mundo; es normal.

### Paso 5.3 — La versión sin “www”

Mucha gente escribe `veneautos.com.co` sin `www`. Lo ideal es que **redirija** a `www` o al revés, según lo que quieras. Eso se configura **en Vercel** (agregás el otro dominio y elegís “redirect”) o en el DNS del proveedor. Si no lo hacés, no es tragedia: solo que sin `www` puede no abrir.

---

## Parte 6 — “Permiso para que la pantalla hable con el motor”

Cuando la pantalla (Vercel) y el motor (Railway) son **dos direcciones distintas**, el navegador pide **permiso** para que se hablen. Eso lo configura quien tiene el código del **motor** (lista de “sitios de confianza”).

**Qué tenés que pedirle a quien programa:** “En producción, agregá `https://www.veneautos.com.co` a la lista de sitios permitidos del API.” Vos no tenés que saber el nombre técnico: con esa frase alcanza.

---

## Parte 7 — Checklist final (marcá con el dedo)

- [ ] Supabase: proyecto creado y **llave larga** copiada.
- [ ] Railway: apunta a carpeta **`api`**, variables pegadas, **URL pública** copiada y el servicio **prendido** (verde).
- [ ] Vercel: apunta a carpeta **`web`**, variable con la **URL de Railway**, deploy OK.
- [ ] Dominio: CNAME hecho donde compraste el dominio, tal cual Vercel dijo.
- [ ] Probás **www.veneautos.com.co** desde otro dispositivo / datos del celular (no solo WiFi de casa).

---

## Si algo “no anda” y no sabés por qué

1. **¿Railway está verde?** Si está rojo, entrá y leé el mensaje de error (aunque sea en inglés, copiá y pegá en Google Traductor).
2. **¿La URL del motor en Vercel está bien pegada?** Un solo carácter de más o de menos rompe.
3. **¿Pasaron unas horas desde el DNS?** Esperá y probá de nuevo.
4. **¿Entrás por https?** Si mezclás `http` y `https` a veces el navegador se queja.

---

## Dónde quedó guardado esto en tu computadora

Este manual está en el proyecto como:

**`docs/MANUAL_PRODUCCION_PASO_A_PASO.md`**

Podés abrirlo con el Bloc de notas o desde Cursor cuando lo necesites.

---

*Texto orientativo. Los nombres exactos de menús en Supabase, Railway y Vercel cambian a veces de idioma o diseño; seguí las palabras parecidas (“Settings”, “Variables”, “Domains”, “Deploy”).*
