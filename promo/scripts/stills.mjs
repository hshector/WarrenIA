// Review stills: bundle once, render many frames.
// Usage: node scripts/stills.mjs <compositionId> <outDir> <frame> [frame...]
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import path from "node:path";

const [id, outDir, ...frames] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE ?? null;
const composition = await selectComposition({ serveUrl, id, browserExecutable });
for (const f of frames) {
  const output = path.join(outDir, `${id}-${String(f).padStart(4, "0")}.png`);
  await renderStill({ composition, serveUrl, frame: Number(f), output, browserExecutable, scale: 0.5 });
  console.log(output);
}
