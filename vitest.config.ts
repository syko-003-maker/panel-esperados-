import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Config Vitest — tests unitaires uniquement (pas de DOM, pas de Next.js).
 *
 * - Resolveur des paths `@/*` via tsconfig.json
 * - Environnement node (pas jsdom — on ne teste pas de composants UI ici)
 * - Tests collectés dans tests/**\/*.test.ts (et co-localisés .test.ts)
 * - Pas d'import des routes API (qui importent Prisma + auth → trop lourd)
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false,
    include: [
      "tests/**/*.test.ts",
      "src/**/*.test.ts",
    ],
    exclude: [
      "node_modules/**",
      ".next/**",
      "discord-worker/**",
      "prisma/**",
    ],
    // Single fork suffit pour l'instant (76 tests, < 1s).
    // À ré-évaluer quand on dépasse 500 tests.
    pool: "forks",
    reporters: process.env.CI ? "default" : "default",
  },
});
