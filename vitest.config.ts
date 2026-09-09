import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: resolve(root, "$1") }],
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/__tests__/*.test.ts"],
  },
});
