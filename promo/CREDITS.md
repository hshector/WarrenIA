# Créditos y licencias

## Música y efectos de sonido

Toda la banda sonora (base de 120 BPM, pad, bajo, percusión, arpegio) y todos los efectos (teclas, clic de envío, chispas, golpe, clics de los chips, barrido del giro, campanilla) se sintetizan desde cero con `scripts/make_audio.py` (numpy + scipy). No se usa ninguna muestra ni grabación de terceros.

- Autor: generado para este proyecto. Sin licencias de terceros que cumplir.
- No se usan los MP3 de `video-shotcraft/assets/audio/bgm/` ni sus SFX (video-shotcraft no llegó a instalarse en esta sesión).

## Tipografías

- **Geist** y **Geist Mono** © 2023 Vercel, en colaboración con basement.studio. SIL Open Font License 1.1. Archivos copiados del paquete `geist` 1.5.1 (el que usa `web/`); licencia en `public/fonts/OFL-Geist.txt`.

## Software

- **Remotion** 4.0.535: licencia gratuita para equipos de hasta 3 personas; por encima, licencia de empresa (remotion.pro/license).
- numpy, scipy (BSD-3-Clause), ffmpeg (LGPL/GPL, solo como herramienta).

## Imagen

- Marca y pantallas: WarrenIA (este repositorio). Las pantallas se redibujan en Remotion con los tokens de `web/app/globals.css`.
- Datos: sintéticos (motor `python -m warrenia_engine demo` y `src/lib/data.ts`). Sin datos reales de cartera.
- Sin logos ni fuentes de terceros; el teléfono es un rectángulo redondeado genérico.
