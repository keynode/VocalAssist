import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "audio");
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [resolve(root, "src/midi-audio-engine.js")],
  outfile: resolve(outDir, "midi-audio-engine.min.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: ["chrome100", "safari16", "firefox100"],
  legalComments: "linked",
});

await copyFile(
  resolve(root, "node_modules/spessasynth_lib/dist/spessasynth_processor.min.js"),
  resolve(outDir, "spessasynth_processor.min.js"),
);
await copyFile(
  resolve(root, "node_modules/spessasynth_lib/LICENSE"),
  resolve(outDir, "SPESSASYNTH-LICENSE.txt"),
);
