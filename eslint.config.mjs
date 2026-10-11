// Flat config (eslint 9): typescript-eslint recommended on TS sources.
// Generated code is excluded (its review surface is the OpenAPI snapshot);
// .astro inline scripts are out of scope until an Astro processor is adopted.
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      ".astro/",
      "src/lib/api-generated.ts",
      "src/env.d.ts",
      "src/vite-env.d.ts",
    ],
  },
  ...tseslint.configs.recommended
);
