import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";

export default defineConfig([
  globalIgnores(["dist/**", "node_modules/**"]),
  js.configs.recommended,
  ...pluginVue.configs["flat/essential"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "vue/multi-word-component-names": "off",
    },
  },
]);
