# Puesta en marcha (todo gratuito)

Tiempo estimado: unos 45 minutos de configuración, más ~2 horas de la primera descarga de datos, que se hace sola.

Necesitas cuentas en: **GitHub** (ya la tienes), **Supabase**, **Vercel** y **Massive**. Son opcionales **EODHD**
(precios en EUR de tus ETFs) y un token de GitHub (para el botón «Actualizar»).

> El código está en la rama `claude/wizardly-cori-baj0xo`. Vercel y los procesos programados de GitHub usan la rama
> por defecto (`main`): fusiona la rama en `main` (Pull Request → Merge) antes del paso 4.

---

## 1. Supabase (base de datos, login y almacenamiento) — plan Free

1. <https://supabase.com> → *New project*. Elige una región en la UE, p. ej. *Frankfurt*, y una contraseña de base de
   datos que guardarás tú.
2. *SQL Editor* → *New query* → pega el contenido de [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql)
   → *Run*. Crea las tablas con Row Level Security y el bucket privado `market`.
3. *Project Settings → API Keys*. Anota:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **Publishable key** (`sb_publishable_…`): se puede exponer al navegador.
   - **Secret key** (`sb_secret_…`): **secreta**, solo para servidor y GitHub Actions.
4. *Authentication → URL Configuration*:
   - *Site URL*: la URL de Vercel del paso 4 (puedes volver después).
   - *Redirect URLs*: añade `https://TU-APP.vercel.app/auth/callback` y, para desarrollo,
     `http://localhost:3000/auth/callback`.
5. *Authentication → Sign In / Providers → Email*: activado. Cuando hayas entrado por primera vez, puedes desactivar
   *Allow new users to sign up*. Además, la app solo deja entrar a los correos de `ALLOWED_EMAILS`.

Nota del plan Free: los proyectos se pausan tras 7 días sin actividad. El proceso diario de datos escribe cada día y
lo mantiene activo.

## 2. Massive (datos de mercado de EE. UU.) — plan Basic gratuito

1. <https://massive.com> (antes polygon.io) → crea una cuenta → copia tu **API key**.
2. Revisa las condiciones vigentes del plan gratuito: uso personal, 5 peticiones/min, ~2 años de historia.

## 3. GitHub Actions (proceso diario de datos)

En el repositorio: *Settings → Secrets and variables → Actions → New repository secret*:

| Secret | Valor |
|---|---|
| `SUPABASE_URL` | Project URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key de Supabase (`sb_secret_…`) |
| `MASSIVE_API_KEY` | API key de Massive |
| `SEC_USER_AGENT` | `WarrenIA tu-email@dominio.com`: la SEC exige identificarse con un e-mail de contacto |
| `EODHD_API_KEY` | *(opcional)* clave gratuita de <https://eodhd.com> para los precios en EUR de tus ETF/ETC |

Después:

1. Pestaña *Actions* → workflow **market-data** → *Run workflow*.
2. La **primera ejecución tarda ~2 h** (unas 540 sesiones a 5 peticiones/min). Si se corta, la siguiente continúa.
3. Al terminar, en Supabase → *Storage → market* verás `published/latest.json`.
4. *(Opcional)* Workflow **backtest** → *Run workflow*. Después se ejecuta solo cada sábado.

A partir de ahí se ejecuta solo de martes a sábado a las 01:35 UTC, con un reintento a las 06:05 UTC.

## 4. Vercel (la web) — plan Hobby

1. <https://vercel.com> → *Add New → Project* → importa `hshector/WarrenIA`.
2. **Root Directory: `web`**. El framework se detecta solo (Next.js).
3. *Environment Variables* (Production):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `SUPABASE_SECRET_KEY` | Secret key (sin `NEXT_PUBLIC_`) |
| `ALLOWED_EMAILS` | tu correo (los correos permitidos, separados por comas) |
| `NEXT_PUBLIC_SITE_URL` | `https://TU-APP.vercel.app` |

4. *Deploy*. Abre la URL, introduce tu correo y entra con el enlace que recibirás.

Si falta la configuración de Supabase, la web **no muestra datos**: redirige a `/setup` y falla de forma segura.

### Botón «Actualizar» (opcional)

1. GitHub → *Settings → Developer settings → Fine‑grained tokens → Generate new token*.
   - *Repository access*: solo `hshector/WarrenIA`.
   - *Permissions*: **Actions: Read and write**.
2. En Vercel añade `GITHUB_DISPATCH_TOKEN` (el token), `GITHUB_REPO=hshector/WarrenIA` y `GITHUB_REF_NAME=main`.
3. Vuelve a desplegar.

El servidor aplica un enfriamiento de 15 minutos entre actualizaciones.

## 5. Instalar en el móvil (PWA)

- **Android / Chrome:** menú ⋮ → *Instalar aplicación*.
- **iPhone / Safari:** *Compartir → Añadir a pantalla de inicio*.

La app nunca guarda precios ni rankings para uso sin conexión: sin red muestra un aviso en lugar de datos antiguos.

## 6. Tu cartera

1. *Portfolio → Instrumento*: da de alta lo que compres. Por ejemplo, el ETF del núcleo con fuente **EODHD** y
   símbolo `TICKER.XETRA`, el oro igual, y las acciones de EE. UU. con fuente **Mercado EE. UU.** y su ticker.
2. Registra **cada aportación** al bróker (*Aportación*) y cada compra con su comisión. Sin las aportaciones, la app
   las infiere y te avisa.
3. *Importar CSV* acepta el formato de [`docs/import-template.csv`](import-template.csv), con vista previa y
   validación. No se piden credenciales del bróker: Trade Republic no ofrece una API pública.

---

## Desarrollo local

```bash
# Motor (Python 3.11+)
python -m venv .venv && . .venv/bin/activate
pip install -e "./engine[dev]"
python -m warrenia_engine demo        # mercado sintético (DEMO) -> ./data
python -m warrenia_engine backtest
cd engine && pytest -q

# Web (Node 20.9+)
cd web && npm ci
WARRENIA_LOCAL_MODE=1 npm run dev     # http://localhost:3000, sin login, datos de ./data
npm test                              # unit tests (Vitest)
npm run build && npx playwright test  # E2E (requiere los datos demo)
```

Con datos reales en local: exporta `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` y la web los leerá del bucket.
También puedes ejecutar `MASSIVE_API_KEY=… SEC_USER_AGENT=… python -m warrenia_engine update` con almacenamiento
local, sin las variables de Supabase.
