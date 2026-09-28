import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const rawHexMessage =
  "Raw hex colors are not allowed. Use a theme token (bg-terra, text-danger, …) from app/globals.css, or add a named literal to src/lib/theme.ts.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Guard against new raw hex colors; src/lib/theme.ts holds the only literals.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/theme.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9A-Fa-f]{6}/]",
          message: rawHexMessage,
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9A-Fa-f]{6}/]",
          message: rawHexMessage,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
