# Vídeo promocional de WarrenIA

Proyecto Remotion (TypeScript) del vídeo para X. Brief: [`briefs/x-18s.md`](briefs/x-18s.md). Reglas: [`KICKOFF.md`](KICKOFF.md).

## Entregables (`final/`)

| Archivo | Qué es |
| --- | --- |
| `warrenia-x-1080x1080.mp4` | Master 1:1, 18 s, H.264, 60 fps, en bucle |
| `warrenia-x-1920x1080.mp4` | Versión 16:9 |
| `hooks/hook-{A,B,C}-1080x1080.mp4` | Las tres variantes de los primeros 2,5 s |
| `cover-1080x1080.png`, `cover-1920x1080.png` | Portadas |

## Estructura

```
src/
  timeline.json        tiempos de cada escena (60 fps); lo leen también el audio y los stills
  theme.ts             tokens de web/app/globals.css + paleta de datos para vídeo
  scenes/              HookReveal (0–5 s), Product (5–9 s), Features (9–14 s), Close (14–18 s)
  screens/             pantallas de la app redibujadas con datos de demostración
  components/          campo píldora, corchetes, teléfono genérico, gráficas
  lib/data.ts          todas las cifras (sintéticas)
scripts/
  make_audio.py        banda sonora y efectos sintetizados → public/audio/
  render.sh            renderiza todo en final/
  stills.mjs           fotogramas de revisión
  capture.mjs          capturas de la app en modo demo (referencia, no se usan en el vídeo)
```

## Cómo se renderiza

```bash
cd promo && npm ci
python scripts/make_audio.py          # necesita numpy y scipy, y ffmpeg
npm run render                        # escribe final/
npx remotion studio                   # vista previa interactiva
```

Si `npx remotion browser ensure` no puede descargar Chrome Headless Shell (red bloqueada), usa uno local:
`export REMOTION_BROWSER_EXECUTABLE=/ruta/a/chrome-headless-shell` (lo lee `remotion.config.ts`).

## Decisiones

- **Pantallas redibujadas, no capturas.** Las tarjetas reproducen los componentes reales de la app (tokens, radios, Geist, tarjeta salvia) con gráficas más visuales: valor frente a aportado, donut de reparto, proyección en abanico, puntuación de momentum con su desglose, lotes FIFO y tramos del ahorro. Todas las cifras son de demostración y cada plano lo indica.
- **Sin logos de terceros.** Los valores son los tickers sintéticos del motor demo (X615, X682…) con iniciales; el teléfono es un rectángulo redondeado genérico.
- **Paleta de datos.** Salvia, oro y violeta de la app con más croma para vídeo; validada con el validador de `dataviz` (CVD ΔE ≥ 8, visión normal ΔE ≥ 15, contraste ≥ 3:1 sobre `#1c1c1e`).
- **Bucle.** El último fotograma es el primero: el wordmark se pliega en el cursor y vuelve el campo vacío. El audio también hace bucle (la cola se suma al inicio).
- **Licencia de Remotion:** gratis hasta 3 personas; con más hace falta licencia de empresa.
