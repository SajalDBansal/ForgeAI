import { nodeConfig } from "@repo/eslint-config/node"

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
