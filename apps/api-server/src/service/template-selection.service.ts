import { templateMetadataSchema } from "@forgeAI/shared"

export interface SelectableTemplate {
  name: string
  description: string
  tag: string
  metadata: unknown
}

const DEFAULT_TEMPLATE_NAME = "nextjs-starter"

const TEMPLATE_HINTS: Record<
  string,
  { phrases: string[]; words: string[]; priority: number }
> = {
  "python-fastapi-starter": {
    priority: 90,
    phrases: [
      "fastapi",
      "python api",
      "python backend",
      "uvicorn",
      "machine learning api",
      "ml api",
    ],
    words: ["python", "fastapi", "uvicorn", "flask", "django", "pydantic"],
  },
  "go-api-starter": {
    priority: 80,
    phrases: ["golang", "go api", "go backend", "go service"],
    words: ["golang"],
  },
  "node-api-starter": {
    priority: 70,
    phrases: [
      "node api",
      "node backend",
      "fastify",
      "express api",
      "rest api",
      "webhook server",
    ],
    words: [
      "api",
      "backend",
      "server",
      "fastify",
      "express",
      "webhook",
      "worker",
    ],
  },
  "turborepo-starter": {
    priority: 60,
    phrases: [
      "turborepo",
      "turbo repo",
      "monorepo",
      "web and api",
      "frontend and backend",
      "full stack monorepo",
    ],
    words: ["monorepo", "workspace", "workspaces", "turborepo", "turbo"],
  },
  "react-vite-starter": {
    priority: 50,
    phrases: [
      "vite",
      "react vite",
      "single page app",
      "client app",
      "frontend app",
    ],
    words: ["react", "vite", "spa", "frontend", "client"],
  },
  "runtime-base": {
    priority: 10,
    phrases: [
      "runtime base",
      "polyglot",
      "node python go",
      "node and python and go",
    ],
    words: ["polyglot"],
  },
  "nextjs-starter": {
    priority: 40,
    phrases: [
      "next.js",
      "nextjs",
      "next app",
      "app router",
      "full stack app",
      "seo",
    ],
    words: ["next", "nextjs", "seo"],
  },
}

function wordsIn(text: string): Set<string> {
  return new Set(text.match(/[a-z0-9.#+-]+/g) ?? [])
}

function scoreTemplate(
  prompt: string,
  tokens: Set<string>,
  template: SelectableTemplate,
): number {
  const hints = TEMPLATE_HINTS[template.name]
  if (!hints) return 0

  let score = 0
  for (const phrase of hints.phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (new RegExp(`\\b${escaped}\\b`).test(prompt)) score += 8
  }
  for (const word of hints.words) {
    if (tokens.has(word)) score += 3
  }

  return score
}

// Chooses a template from the published catalog for prompt-started projects.
// It is deterministic on purpose: first-open runtime resolution should be cheap and repeatable.
export function chooseTemplateNameForPrompt(
  prompt: string,
  templates: SelectableTemplate[],
): string | undefined {
  const lower = prompt.toLowerCase()
  const tokens = wordsIn(lower)
  const available = new Set(templates.map((template) => template.name))

  // An explicit environment request takes precedence over its individual runtime names.
  if (
    available.has("runtime-base") &&
    /\b(runtime base|polyglot|node (?:and )?python (?:and )?go)\b/.test(lower)
  )
    return "runtime-base"
  if (
    available.has("turborepo-starter") &&
    /\b(turborepo|turbo repo|monorepo)\b/.test(lower)
  )
    return "turborepo-starter"

  let best: { name: string; score: number; priority: number } | undefined
  for (const template of templates) {
    const score = scoreTemplate(lower, tokens, template)
    const priority = TEMPLATE_HINTS[template.name]?.priority ?? 0
    if (
      !best ||
      score > best.score ||
      (score === best.score && priority > best.priority)
    ) {
      best = { name: template.name, score, priority }
    }
  }

  if (best && best.score > 0) return best.name
  return available.has(DEFAULT_TEMPLATE_NAME)
    ? DEFAULT_TEMPLATE_NAME
    : templates[0]?.name
}

export function stackNamesFromTemplate(template: SelectableTemplate): string[] {
  const metadata = templateMetadataSchema.safeParse(template.metadata)
  return metadata.success ? metadata.data.stack.map((item) => item.name) : []
}
