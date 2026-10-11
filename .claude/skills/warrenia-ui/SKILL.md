---
name: warrenia-ui
description: Convenciones de interfaz de WarrenIA (web/ y la PWA en el móvil). Úsala antes de crear o cambiar cualquier componente, pantalla, formulario, hoja, aviso, animación o cifra en web/, y al revisar UI. Resume qué ya está resuelto en el proyecto (tokens de movimiento, `tap`, `Sheet`, Sonner, formato de importes, datos de caso peor) y a qué skill de diseño acudir para cada cosa.
---

# Interfaz de WarrenIA

WarrenIA es una herramienta financiera personal que se usa sobre todo **en el móvil como PWA instalada**.
Estilo: claro, tranquilo, tipo iOS; un solo acento naranja; verde y rojo solo para ganancias y pérdidas.
Es un panel profesional: el movimiento es rápido y funcional, nunca decorativo.

## Ya resuelto: úsalo, no lo reinventes

| Necesidad | Usa | Dónde |
| --- | --- | --- |
| Curvas de animación | `ease-out`, `ease-in-out` (sobrescritas con curvas fuertes) y `var(--ease-drawer)` | `web/app/globals.css` (`@theme`) |
| Respuesta al pulsar | Clase `tap` (escala 0,97 en `:active`, 160 ms) en todo lo pulsable | `globals.css` |
| Filas de lista pulsables | `transition-colors hover:bg-surface-2 active:bg-surface-3` | `Row` en `primitives.tsx` |
| Hoja / modal | `<Sheet>`: hoja inferior que se cierra arrastrando en el móvil, modal centrado desde `sm` | `web/components/ui/sheet.tsx` |
| Confirmar algo destructivo | `<ConfirmDialog>`; nunca `window.confirm` | `sheet.tsx` |
| Avisos de resultado | `toast.success / toast.error` de `sonner` (el `<Toaster>` ya está montado) | `components/shell/toaster.tsx` |
| Errores de formulario | En línea junto al formulario (`Result`); el éxito va en un aviso | `components/portfolio/forms.tsx` |
| Importe grande destacado | `moneyHeadline()`: sin céntimos desde 100.000 | `web/lib/format.ts` |
| Unidades de una posición | `units()`: nunca redondear 0,000123 a 0,0001 | `lib/format.ts` |
| Cifras | Clase `num` (tabular) y `whitespace-nowrap`; una cifra nunca se trunca | — |
| Modo oscuro | Tokens redefinidos en `:root.dark`; elección en Ajustes → Apariencia (`next-themes`) | `globals.css`, `components/shell/theme.tsx` |
| Colores secundarios | `bg-gold`, `bg-violet`, `bg-violet-soft`, `var(--lilac)`, `var(--peach)`, `var(--av-1…6)`, `bg-thumb` | `globals.css` |

## Reglas

1. **Móvil primero.** Los campos son de 16px en pantallas táctiles (`pointer-coarse:text-[16px]`), porque si no iOS hace zoom. Usa `dvh` y no `vh`, y `env(safe-area-inset-*)` en todo lo fijo. El `hover:` de Tailwind 4 ya se ignora en pantallas táctiles.
2. **Anima solo `transform`, `opacity` y `scale`**, y nunca `transition-all`. Duración de la UI por debajo de 300 ms. La salida es más rápida que la entrada.
3. **No animes lo que se ve decenas de veces al día**: cifras de la cartera al cargar, gráficos, cambio de pestaña, navegación.
4. **Reducir movimiento significa más suave, no ninguno**: se mantienen los fundidos y se quitan los desplazamientos (ver el final de `globals.css`).
5. **Los textos de datos se ajustan, no se recortan**: nombres con `line-clamp-2` o `truncate` y elipsis, nunca recortados en silencio. Valida con `npm run dev:worst` y con los E2E `worst-phone`, `worst-phone-dark` y `worst-desktop`.
6. **Nunca pongas colores a mano** (`#hex`, `text-white`, `bg-black`): usa un token, o crea uno en `:root` **y** en `:root.dark`. Excepción: el texto blanco sobre la tarjeta naranja (`nebula`), que es igual en los dos modos. Sobre `bg-ink` el texto es `text-surface`, y sobre `bg-accent` es `text-accent-ink`.
7. Si un componente lee los tokens una sola vez (como los gráficos), recréalo cuando cambie el tema con `useThemeClass()`.
8. Las hojas y diálogos nuevos pasan por `Sheet` o `ConfirmDialog`, para que hereden la animación, el arrastre, las zonas seguras y el `overscroll-behavior`.

## Qué skill usar

- Decidir o revisar un detalle de UI o de movimiento: `emil-design-eng` (las revisiones van en tabla Antes/Después/Por qué).
- Construir una animación nueva: `animate`. Revisar animaciones existentes: `review-animations`.
- Que algo se sienta nativo en el teléfono (PWA): `mobile-native`.
- Gestos, muelles, materiales y tipografía al estilo iOS: `apple-design`.
- Pantallas o componentes con datos nuevos: `break-ui`. Amplía `web/scripts/worst-case.mjs` con los campos nuevos en vez de editar el componente.
- Si algún día hay app nativa con Expo / React Native: `animate-expo`.

Estas skills de terceros son de Emil Kowalski (MIT, ver `LICENSE-emilkowalski-skills`), copiadas del commit
`2d228630` de github.com/emilkowalski/skills. Donde choquen con este documento, manda este documento.
