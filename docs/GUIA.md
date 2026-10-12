# Guía paso a paso: qué tienes que hacer tú

Esta guía es para dejar WarrenIA funcionando con todo lo nuevo:

- notificaciones de cambios de señal;
- importación del CSV de Trade Republic;
- fundamentales también de empresas europeas (IFRS);
- liquidez como bloque opcional;
- proyección de patrimonio.

Hazla **en este orden**. Son unos 30 minutos.

Si es la primera vez que despliegas la app, antes de nada sigue [DEPLOY.md](DEPLOY.md): crear Supabase, Massive, Vercel y los secrets de GitHub. Esta guía da eso por hecho.

---

## Paso 0. Que el código nuevo llegue a `main` (2 min)

Vercel y los procesos diarios de GitHub usan la rama `main`. Mientras los cambios estén solo en la rama de trabajo, no verás nada nuevo.

- **Opción fácil:** dile a Claude «abre el PR y mergéalo».
- **A mano:** en GitHub, pestaña *Pull requests* → *New pull request* → base `main` ← compare `claude/adoring-ritchie-qzyu16` → *Create* → *Merge pull request*.

Vercel vuelve a desplegar solo en 1-2 minutos.

## Paso 1. Actualizar la base de datos en Supabase (3 min)

1. Entra en <https://supabase.com/dashboard> → tu proyecto → menú izquierdo **SQL Editor** → **New query**.
2. Abre en GitHub el archivo [`supabase/migrations/0002_settings_choices.sql`](../supabase/migrations/0002_settings_choices.sql), copia todo su texto, pégalo y pulsa **Run**. Debe decir *Success. No rows returned*.
3. Otra **New query** con [`supabase/migrations/0003_cash_notifications.sql`](../supabase/migrations/0003_cash_notifications.sql) → **Run**.

Las dos se pueden ejecutar más de una vez sin problema.

Qué activa cada una:

- **0002:** guardar los productos que eliges en *Plan*.
- **0003:**
  - el bloque de liquidez;
  - la tabla de dispositivos que reciben notificaciones;
  - tus preferencias de avisos.

## Paso 2. Generar las claves de notificación (2 min)

Las notificaciones push necesitan un par de claves (VAPID) que se crea una sola vez. La app las genera en tu navegador: no salen de él.

1. Abre tu WarrenIA (la URL de Vercel) → **Settings → Notifications**.
2. Pulsa **Generate keys**. Aparecen dos claves:
   - **Public key**
   - **Private key (secret)**
3. Déjalas abiertas o cópialas en una nota temporal. **No compartas la privada con nadie.**

## Paso 3. Poner las claves en Vercel (3 min)

1. <https://vercel.com> → tu proyecto → **Settings → Environment Variables**.
2. Añade estas tres variables, marcadas para *Production*:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | la *Public key* |
| `VAPID_PRIVATE_KEY` | la *Private key* |
| `VAPID_SUBJECT` | tu e-mail, p. ej. `hectorsanchispont@gmail.com` |

3. Pestaña **Deployments** → en el último despliegue, menú **⋯ → Redeploy**. Sin redesplegar, la clave pública no llega a la web.

## Paso 4. Poner las claves en GitHub (2 min)

El aviso diario lo envía el proceso de GitHub, no Vercel.

1. GitHub → repositorio `hshector/WarrenIA` → **Settings → Secrets and variables → Actions → New repository secret**.
2. Crea dos secrets:
   - `VAPID_PRIVATE_KEY`: la misma *Private key*.
   - `VAPID_SUBJECT`: tu e-mail.
3. En esa misma página, comprueba que existe **`SEC_USER_AGENT`** con el formato `WarrenIA tu-email@gmail.com`. Sin él no hay fundamentales.

## Paso 5. Activar las notificaciones en el móvil (3 min)

- **iPhone:** las notificaciones solo funcionan con la app instalada.
  1. Abre la URL en **Safari**.
  2. Pulsa **Compartir → Añadir a pantalla de inicio**.
  3. Abre WarrenIA **desde ese icono**, no desde Safari.
- **Android:** en Chrome, menú **⋮ → Instalar aplicación** (recomendado, aunque también funciona sin instalar).

Después, dentro de la app:

1. **Settings → Notifications → Turn on**.
2. Acepta el permiso que pide el sistema.
3. Pulsa **Send a test**. Te debe llegar «WarrenIA test» en unos segundos.
4. Elige de qué quieres avisos:
   - **Stocks you own:** sobre todo cuando una acción tuya pasa a «consider selling».
   - **Stocks you follow:** las que marcas con ☆.
   - **New buy candidates:** acciones que acaban de convertirse en candidatas.

Recibirás como mucho **un aviso al día**, de madrugada (hora española) tras la actualización, y solo si cambió algo que te afecta. Todos los cambios quedan además en la campana 🔔 de arriba (página *Alerts*), 120 días.

Si el test no llega:

| Síntoma | Solución |
|---|---|
| «Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY…» | Paso 3 incompleto o falta el *Redeploy* |
| «Notifications were not allowed» / *Blocked* | Ajustes del móvil → Notificaciones → WarrenIA → permitir |
| «Notifications need the database update» | Falta el paso 1 (0003) |
| En iPhone no aparece el botón | No la abriste desde el icono de la pantalla de inicio |

## Paso 6. Lanzar la actualización una vez a mano y revisar (5 min + espera)

1. GitHub → pestaña **Actions** → **market-data** → **Run workflow** → **Run workflow**.
2. Al terminar, abre la ejecución y mira el resumen **«Comprobación de configuración»**. Todo debe salir en verde:

| Comprobación | Qué significa si falla |
|---|---|
| Migración 0002 / 0003 | Falta el paso 1 |
| SEC_USER_AGENT | Falta o no tiene e-mail (paso 4) |
| Notificaciones | Falta `VAPID_PRIVATE_KEY` o `VAPID_SUBJECT`, o la clave no es válida (pasos 2 y 4) |

3. La **primera** ejecución con fundamentales tarda más. Descarga unas 230 tablas de la SEC y, después, el informe anual de cada empresa extranjera (IFRS), hasta 150 por semana. Lo nuevo es:
   - **Empresas europeas:** SAP, Novo Nordisk, AstraZeneca… ahora tienen F-Score, Altman Z'' y el resto de comprobaciones.
   - **ADR:** no muestran ratios de precio (PER, EV/EBIT). El precio es por ADR y los datos no dicen cuántas acciones lleva cada ADR. Mostrarlos podría dar cifras varias veces equivocadas.
4. Paso «Signal-change notifications»:
   - La primera vez no envía nada: necesita dos actualizaciones para comparar.
   - Desde el día siguiente avisará de los cambios.

## Paso 7. Importar tu historial de Trade Republic (5 min)

1. Exporta el CSV desde la app de Trade Republic o desde <https://app.traderepublic.com>: **Perfil → Documentos (Extractos) → Exportar transacciones** → elige **todo el periodo** → **CSV**. El nombre del menú puede variar un poco según la versión.
2. En WarrenIA: **Portfolio → Import CSV** → **Choose CSV file** → **Preview and check**.
3. Debe aparecer **«Trade Republic export recognised»**. Revisa la tabla:
   - Las filas **new** indican cómo se creará cada producto:
     - **ETF del plan** (VWCE, oro…): se reconocen por su ISIN y se colocan en su bloque.
     - **Acciones de EE. UU.**: si el nombre coincide con una del radar, se valoran a diario. Si no, «price from your trades».
   - Las filas en rojo **no se importan** y dicen qué hacer:
     - acciones traspasadas desde otro bróker: hay que darlas de alta a mano con su precio de compra original, porque Hacienda lo necesita;
     - operaciones societarias;
     - cripto comprada directamente.
4. Pulsa **Import N valid rows**. Puedes volver a importar el mismo archivo, o uno más reciente, sin duplicar: las filas ya importadas se saltan.
5. **Precio diario de tus ETF** (opcional, recomendado):
   1. Para cada ETF europeo: **Portfolio → Transactions → editar instrumento → Price source: EODHD**.
   2. Pon su símbolo de Xetra:

| Producto | Símbolo EODHD |
|---|---|
| Vanguard FTSE All-World | `VWCE.XETRA` |
| iShares Core MSCI World | `EUNL.XETRA` |
| Xtrackers MSCI World | `XDWD.XETRA` |
| SPDR ACWI IMI | `SPYI.XETRA` |
| Xtrackers EUR Overnight | `XEON.XETRA` |

   Para el resto, busca el ISIN en eodhd.com. Hace falta el secret `EODHD_API_KEY` (gratis, ver DEPLOY.md). Sin esto, el valor se toma de tu última compra.

Detalle de cómo se registra cada fila:

- **Dividendos:** se guardan netos, con la retención al lado.
- **Intereses:** netos del 19 % retenido.
- **Pagos con tarjeta:** cuentan como retiradas de dinero. Así el efectivo cuadra.
- **Saveback y acciones regalo:** cuentan como un ingreso más una compra.

## Paso 8. Ajustar tu plan (5 min)

1. **Plan → 1. Core:** responde las tres preguntas y pulsa **Use this as my core**. Recomendado: Vanguard FTSE All-World (`IE00BK5BQT80`).
2. **Plan → 2. Diversifiers:** elige mezcla (*Classic* = todo oro) → **Save mix**.
3. **Liquidez (opcional):** solo si quieres guardar dinero para un fondo de emergencia o un gasto en menos de 3 años.
   1. **Settings → Target mix**: pon, por ejemplo, Cash 5 % y baja Core al 70 %. Los porcentajes tienen que sumar 100.
   2. En **Plan → 4. Cash**, elige entre:
     - **efectivo remunerado de Trade Republic:** sin comisiones, con garantía de depósitos hasta 100.000 €, pero los intereses tributan cada año;
     - **ETF monetario XEON** (`LU0290358497`): solo tributa al vender.
4. **Plan → Where this could take you:** cambia años y aportación para ver el rango de resultados:
   - **caso malo:** 1 de cada 10 veces sale peor;
   - **caso medio;**
   - **caso bueno:** 1 de cada 10 veces sale mejor.
   Está en euros de hoy (descontada la inflación) y antes de impuestos. No es una promesa.

## Paso 9. Comprobar en Trade Republic que existen los productos (2 min)

En el buscador de Trade Republic, busca cada ISIN que vayas a usar y confirma que se puede comprar y crear plan de ahorro:

| ISIN | Producto |
|---|---|
| `IE00BK5BQT80` | Vanguard FTSE All-World |
| `IE00B4ND3602` | iShares Physical Gold |
| `IE00BP3QZ825` | iShares World Momentum |
| `LU0290358497` | XEON (solo si usas liquidez en ETF) |

Si alguno no aparece, dímelo y lo cambio por la alternativa del catálogo.

---

## Resumen de dónde va cada clave

| Dato | Vercel | GitHub (Actions secrets) |
|---|---|---|
| Public key | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | — |
| Private key | `VAPID_PRIVATE_KEY` | `VAPID_PRIVATE_KEY` |
| Tu e-mail | `VAPID_SUBJECT` | `VAPID_SUBJECT` |
| `WarrenIA tu-email@…` | — | `SEC_USER_AGENT` |

Si la clave privada se filtra:

1. Genera un par nuevo (borra antes `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en Vercel para que vuelva a salir el botón *Generate keys*).
2. Sustitúyela en los dos sitios.
3. Vuelve a pulsar **Turn on** en cada móvil.
