import vinext from "vinext";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const commit = process.env.GITHUB_SHA || null;
  if (commit && !/^[a-f0-9]{40}$/.test(commit)) throw Error("Expected a full GitHub commit SHA.");
  if (process.env.GITHUB_ACTIONS === "true" && !commit) throw Error("Missing GitHub checkout SHA.");
  return {
    server: {host: '0.0.0.0', allowedHosts: ['terminal.local']},
    define: { __GRAINPAD_COMMIT__: JSON.stringify(commit) },
    resolve: { alias: [
      { find: /^@\/lib\/research\/regtest-(report|state)\.json$/, replacement: fileURLToPath(new URL("./data/lab-display.json", import.meta.url)) },
      { find: /^buffer$/, replacement: fileURLToPath(new URL("./node_modules/buffer/index.js", import.meta.url)) },
      { find: /^bigint-buffer$/, replacement: fileURLToPath(new URL("./node_modules/bigint-buffer/dist/browser.js", import.meta.url)) },
      // Share cards: satori's yoga loads from a compiled wasm module (Workers forbid runtime wasm compilation).
      { find: /^yoga-layout\/load$/, replacement: fileURLToPath(new URL("./lib/og/yoga-load.mjs", import.meta.url)) },
      { find: /^grainpad-yoga-binary$/, replacement: fileURLToPath(new URL("./node_modules/yoga-layout/dist/binaries/yoga-wasm-base64-esm.js", import.meta.url)) },
      { find: /^grainpad-yoga-wrap$/, replacement: fileURLToPath(new URL("./node_modules/yoga-layout/dist/src/wrapAssembly.js", import.meta.url)) },
      { find: /^grainpad-yoga-enums$/, replacement: fileURLToPath(new URL("./node_modules/yoga-layout/dist/src/generated/YGEnums.js", import.meta.url)) },
    ] },
    plugins: [vinext(), cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
      configPath: process.env.GRAINPAD_WORKER_CONFIG || "./wrangler.jsonc",
    })],
  };
});
