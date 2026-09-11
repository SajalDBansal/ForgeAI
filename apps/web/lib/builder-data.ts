// Turns a prompt into a short kebab-case project name (mirrors @forgeAI/shared).
// Copied because the web app only imports types from the shared package.
export function projectNameFromPrompt(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 28)
    .replace(/^-|-$/g, "")
  return slug || "new-project"
}
