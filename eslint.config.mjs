// ESLint flat config (task T007).
import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

const NEXT_PUBLIC_SECRET =
  "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^NEXT_PUBLIC_.*(KEY|SECRET|TOKEN)/]";

const config = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/next-env.d.ts",
      "specs/**",
      "history/**",
      ".specify/**",
      ".claude/**",
    ],
  },
  ...nextVitals,
  ...tseslint.configs.recommended,
  {
    settings: { next: { rootDir: "apps/web" } },
    rules: {
      // Security rules required by tasks T007 / research R14.
      "react/no-danger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: NEXT_PUBLIC_SECRET,
          message: "Secrets must never use a NEXT_PUBLIC_ prefix (constitution IV).",
        },
      ],
    },
  },
];

export default config;
