import vinext from "vinext";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    resolve: { alias: [
      { find: /^@\/lib\/research\/regtest-(report|state)\.json$/, replacement: fileURLToPath(new URL("./data/lab-display.json", import.meta.url)) },
      { find: /^buffer$/, replacement: fileURLToPath(new URL("./node_modules/buffer/index.js", import.meta.url)) },
      { find: /^bigint-buffer$/, replacement: fileURLToPath(new URL("./node_modules/bigint-buffer/dist/browser.js", import.meta.url)) },
    ] },
    plugins: [vinext(), cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
      configPath: "./wrangler.jsonc",
    })],
  };
});
