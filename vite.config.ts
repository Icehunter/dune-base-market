import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      usePolling: true,
      interval: 300,
    },
    hmr: {
      port: 5173,
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split large/static vendors and the generated piece registry so the
        // detail-page chunk stays small and shared deps cache across pages.
        manualChunks: (id) => {
          if (id.includes("@babylonjs")) return "babylon";
          if (id.includes("@heroui")) return "heroui";
          if (id.includes("@iconify")) return "iconify";
          if (id.includes("@clerk")) return "clerk";
          if (id.includes("pieceRegistry.generated")) return "piece-registry";
        },
      },
    },
  },
});
