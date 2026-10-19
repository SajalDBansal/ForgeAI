# @forgeAI/ui

Shared React UI primitives, styling and class-name utilities for the
[web app](../../apps/web/README.md). Components use Radix primitives and Tailwind CSS;
consumers import the TypeScript source directly.

## Usage

```tsx
import { Button } from "@forgeAI/ui/components/button"
import { cn } from "@forgeAI/ui/lib/utils"

export function SaveButton({ className }: { className?: string }) {
  return <Button className={cn("gap-2", className)}>Save</Button>
}
```

Use component subpaths rather than a root component barrel. The package also exports
`@forgeAI/ui/globals.css` and `@forgeAI/ui/postcss.config` for consumer styling setup.
ForgeAI's web app maps `@forgeAI/ui/*` to this source directory and imports its
[webview.css](src/styles/webview.css) theme from the root layout.

## Layout

| Path                                             | Responsibility                                              |
| ------------------------------------------------ | ----------------------------------------------------------- |
| [src/components](src/components)                 | Buttons, inputs, menus, tabs, tooltips and other primitives |
| [src/lib/utils.ts](src/lib/utils.ts)             | `cn` class composition and Tailwind conflict merging        |
| [src/styles/globals.css](src/styles/globals.css) | Base Tailwind imports and theme tokens                      |
| [src/styles/webview.css](src/styles/webview.css) | ForgeAI web workspace styling                               |
| [postcss.config.mjs](postcss.config.mjs)         | Shared Tailwind PostCSS setup                               |

Keep product state, API calls and authorization in the consuming app. Shared
components should accept their data and actions through props.

## Checks

From the repository root:

```powershell
bun run --cwd packages/ui typecheck
bun run --cwd packages/ui lint
```

There is no standalone UI server or package build. Use `bun run --cwd apps/web dev`
to inspect components in the application, and the web build to verify integration.
