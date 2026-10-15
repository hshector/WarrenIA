# Kickoff: vídeo promocional de WarrenIA

Eres Claude Code en el repo `WarrenIA`. Tu trabajo: producir el vídeo promocional siguiendo los briefs de `promo/briefs/`.

- **Primero** el de X: `promo/briefs/x-18s.md` (~18 s).
- **Después**, solo si te lo pido: `promo/briefs/long-40s.md` (~40 s), reutilizando assets y sistema visual.

Trabaja en una rama nueva `promo-video` (sale de `main`). Commits cortos en inglés. Los MP4 finales van a `promo/final/` y los commiteas; abre una PR al terminar.

## Reglas duras

1. **Alcance.** Todo lo nuevo vive en `promo/` (con su propio `package.json`; no añadas Remotion a `web/`). No modifiques `web/`, `engine/`, `supabase/` ni `config/`.
2. **Solo datos de demostración.** Captura la app únicamente en modo local con datos sintéticos (ver "Capturar la app"). Nunca datos reales de cartera, nunca Supabase real, nunca el contenido de `.env`.
3. **Sin marcas de terceros.** Ni logos de empresas (la app los muestra en `AssetAvatar`: evita esos planos o pixélalos), ni marcos de dispositivos de marca (usa un rectángulo redondeado genérico), ni fuentes o marcas de OpenAI, Grok, Revolut o Google.
4. **Sin promesas financieras.** WarrenIA es una herramienta de análisis: no ejecuta operaciones, no se conecta a brókers y no presenta predicciones como certezas. El vídeo no puede insinuar lo contrario (nada de "gana más", "predice" o "bate al mercado"). Cifras en pantalla: solo de demostración y visibles como tal.
5. **Música.** No uses los MP3 de `video-shotcraft/assets/audio/bgm/` (se borran en el paso 0). Usa música libre de derechos con licencia comercial verificada, o solo efectos de sonido. Apunta cada fuente y su licencia en `promo/CREDITS.md`. De los SFX de video-shotcraft usa solo los que `assets/audio/ATTRIBUTION.md` identifica con origen y licencia; evita los marcados como no rastreables.
6. **Licencia de Remotion.** Gratis hasta 3 personas. Si el equipo crece, hace falta licencia de empresa.

## Paso 0: preparar (hazlo tú, sin preguntar)

1. Instala video-shotcraft (no está en el repo a propósito: pesa 77 MB):
   ```bash
   npx -y skills add Vincentwei1021/video-shotcraft --agent claude-code --copy -y
   rm -rf .claude/skills/video-shotcraft/assets/audio/bgm
   ```
   Está en `.gitignore`: no lo commitees. Si el Skill tool no lo lista, lee su `SKILL.md` con Read y sigue sus instrucciones.
2. Las skills de Remotion (`remotion-*`) y `ui-demo` ya están en `.claude/skills/`. Las del proyecto (`warrenia-ui`, `animate`, `apple-design`, `emil-design-eng`, `review-animations`, `mobile-native`) también: úsalas para revisar la sensación del movimiento.
3. **Preflight de render.** Comprueba `node -v` (≥ 20.9) y `ffmpeg -version`. Crea `promo/` con la skill `remotion-create` (TypeScript) y ejecuta `npx remotion browser ensure`.
   - Si falla por red (timeout, 403) **no reintentes en bucle**. Para y dime qué host se bloquea. Alternativas: un workflow de GitHub Actions con `workflow_dispatch` que instala Chromium y ffmpeg, renderiza y sube el MP4 como artefacto (el repo ya usa Actions), o renderizar en mi ordenador.
4. Fuentes: Geist y Geist Mono (la app ya usa Geist).

## Modo de video-shotcraft (ya elegido: no me lo preguntes)

Modo **co-creación**, siguiendo `references/guided-free-creation.md`, con estos ajustes que tienen prioridad:

- **Una sola confirmación.** Agrupa producto + dirección visual + storyboard completo en un único mensaje y espera mi OK. No pares en cada fase.
- **La dirección visual de los briefs es un requisito explícito mío.** Manda sobre la regla de "derivar el estilo del producto"; la parte de marca se resuelve con los tokens reales de la app (abajo).
- Tras mi OK, continúa solo hasta el final: stills de revisión, render, sonido y QA. No hace falta enseñarme la galería de shots; elige tú los adecuados.

## Hechos del producto (del README: úsalos, no inventes)

WarrenIA es un sistema personal de inteligencia financiera, web Next.js instalable como PWA, que se usa sobre todo en el móvil. Coste mensual 0 €. Funciones reales:

- **Plan:** qué comprar cada mes, con fiscalidad española y proyección de patrimonio.
- **Alertas:** avisos push cuando cambia una señal.
- **Momentum Radar:** screener cuantitativo de momentum, explicable y reproducible.
- **Portfolio:** FIFO, TWR, TIR y desviación frente a objetivos.
- **Antes de vender:** estima el IRPF de una venta antes de hacerla, con lotes FIFO, tramos del ahorro y regla de recompra de 2 meses / 1 año.

Candidatas para las 3 funciones del vídeo corto: Plan, Momentum Radar y Antes de vender. Decide tú con criterio visual.

## Identidad de marca: tokens reales de la app

Lee `web/app/globals.css` y `.claude/skills/warrenia-ui/SKILL.md`. Resumen:

- Acento único de marca: verde salvia «Salvia» (`--accent`: `#8dbf9c` en oscuro, `#527f62` en claro). Superficies oscuras `#1c1c1e` / `#2c2c2e`, texto `#f5f5f7`.
- Secundarios apagados: `--gold`, `--violet`, `--sand`, `--lilac` (lee sus valores en el CSS).
- En vídeo se permite subir algo la saturación, pero todo debe seguir reconociéndose como WarrenIA.
- En los briefs, "colores de acento" = Salvia; las partículas de cuatro colores usan Salvia + tres secundarios de la app, no los colores de Google ni de Revolut.

## Capturar la app (modo demo)

```bash
python -m venv .venv && . .venv/bin/activate && pip install -e "./engine[dev]"
python -m warrenia_engine demo
cd web && npm ci && WARRENIA_LOCAL_MODE=1 npm run dev     # http://localhost:3000
```

- Captura en viewport móvil (390×844, escala 2x), también en modo oscuro. Usa `ui-demo` para las grabaciones con cursor y `npx playwright` (ya está en `web/`) para los stills.
- Grabaciones sin procesar en `promo/assets/raw/` (ignorado por git). Solo los stills que uses van a `promo/public/`.
- `docs/screenshots/` tiene capturas anteriores: sirven de referencia, pero captura de nuevo.

## Empezar

Ejecuta el paso 0 y lee el brief de X. Responde con un único mensaje que contenga: resumen del producto (5 líneas), 3 claims, 3 ganchos, dirección visual con los tokens exactos y storyboard escena a escena. Después espera mi OK.
