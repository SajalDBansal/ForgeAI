# @forgeAI/typescript-config

Shared TypeScript compiler settings used by the apps and packages. Each consumer
extends a JSON preset and supplies its own source paths and output settings.

## Presets

| File                                     | Purpose                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| [base.json](base.json)                   | Strict ES2022 baseline, NodeNext modules and unchecked-index access checks |
| [node-library.json](node-library.json)   | Server and library code with Node types                                    |
| [react-library.json](react-library.json) | React JSX and DOM libraries                                                |
| [nextjs.json](nextjs.json)               | Next.js plugin, bundler resolution and no emitted JavaScript               |
| [vite.json](vite.json)                   | Vite apps with bundler resolution, React JSX and no emitted JavaScript     |

## Usage

For a package that consumes TypeScript source directly:

```json
{
  "extends": "@forgeAI/typescript-config/node-library.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

Apps that compile output should set their own `rootDir` and `outDir`. Keep app-specific
aliases in the consuming `tsconfig.json`; shared presets should remain reusable.

## Validation

This package contains configuration only and has no runtime or build command.
Install dependencies from the [repository root](../../README.md), generate the
database client, then validate changes through the consumers:

```powershell
bun run typecheck
```
