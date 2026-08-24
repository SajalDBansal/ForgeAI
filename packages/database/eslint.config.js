import { nodeConfig } from "@forgeAI/eslint-config/node"

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nodeConfig,
  {
    rules: {
      "turbo/no-undeclared-env-vars": ["warn", { allowList: ["NODE_ENV"] }],
    },
  },
  {
    ignores: ["generated/**"],
  },
]
