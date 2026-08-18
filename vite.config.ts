// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Force a standard Node.js server build instead of the cloudflare-module
  // default. This app depends on better-sqlite3 (native addon) and shells
  // out to the ffmpeg/ffprobe CLIs — neither works on Cloudflare Workers.
  // Deploy this to a real Node host (Railway, Fly.io, Render, a VPS).
  nitro: {
    preset: "node-server",
  },
});
