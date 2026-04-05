import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**", "**/coverage/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.base],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {},
  },
);
