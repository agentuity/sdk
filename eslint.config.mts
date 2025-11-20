import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import json from "@eslint/json";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/templates/**", "**/.agentuity/**", "**/.test-projects/**", "**/test-interop/go-common/**", "**/*.json", "!**/package.json"]
  },
  { 
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"]
  },
  { 
    languageOptions: { 
      globals: {
        ...globals.browser, 
        ...globals.node,
        Bun: "readonly"
      } 
    } 
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ]
    }
  },
  {
    ...pluginReact.configs.flat.recommended,
    settings: {
      react: {
        version: "detect"
      }
    }
  },
  { 
    files: ["**/*.json"],
    ignores: ["**/package.json", "**/tsconfig.json", "**/tsconfig.*.json"],
    ...json.configs.recommended 
  },
];
