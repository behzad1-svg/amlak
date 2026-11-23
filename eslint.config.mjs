import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".netlify/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Server-only backups of route files (e.g. .backup-2026-11-21-advertise-grant)
    // that live next to the checkout on the VPS - never linted, never deployed.
    ".backup-*/**",
  ]),
]);

export default eslintConfig;
