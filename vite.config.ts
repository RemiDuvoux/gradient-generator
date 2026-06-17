import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so assets resolve on GitHub Pages project URLs
// (e.g. https://<user>.github.io/gradient-generator/)
export default defineConfig({
  base: "./",
  plugins: [react()],
});
