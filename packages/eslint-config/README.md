# @forgeAI/eslint-config

Shared ESLint flat configurations for ForgeAI's TypeScript services, React components
and Next.js application.

## Configurations

| Import                                  | Export                | Use                                                                                           |
| --------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `@forgeAI/eslint-config/base`           | `config`              | TypeScript rules, Prettier compatibility, Turbo environment checks and generated-file ignores |
| `@forgeAI/eslint-config/node`           | `nodeConfig`          | Node services and packages                                                                    |
| `@forgeAI/eslint-config/react-internal` | `reactInternalConfig` | React libraries with browser and hooks rules                                                  |
| `@forgeAI/eslint-config/next`           | `nextJsConfig`        | Next.js, React and Core Web Vitals rules                                                      |

Each entry also has a default export. For a service's `eslint.config.js`:

```js
import { nodeConfig } from "@forgeAI/eslint-config/node"

export default [...nodeConfig]
```

The base configuration enables `eslint-plugin-only-warn`, so review emitted
warnings even when lint exits successfully. Consumers can extend the configuration
for their own files and rules.

## Validation

Install dependencies from the [repository root](../../README.md), then run:

```powershell
bun run lint
```

This package has no standalone lint/build script. Validate configuration changes
through affected consumers; for example, `bun run --cwd apps/web lint` exercises
the Next.js configuration.
