import { resolveSandboxPlan, type SandboxPlan } from "@forgeAI/shared"

import type { TemplateDefinition } from "./types.js"

// Lists every way the templates ask for more than one sandbox may have on the plan.
// Empty when they all fit.
export function templatesOverPlan(
  templates: TemplateDefinition[],
  plan: SandboxPlan,
): string[] {
  return templates.flatMap(({ name, metadata: { resources } }) => {
    const problems: string[] = []
    if (resources.cpuCount > plan.maxVcpuPerSandbox) {
      problems.push(
        `${name}: cpuCount ${resources.cpuCount} is above the plan's ${plan.maxVcpuPerSandbox} vCPU`,
      )
    }
    if (resources.memoryMB > plan.maxMemoryMbPerSandbox) {
      problems.push(
        `${name}: memoryMB ${resources.memoryMB} is above the plan's ${plan.maxMemoryMbPerSandbox} MB`,
      )
    }
    if (resources.diskMB > plan.maxDiskMbPerSandbox) {
      problems.push(
        `${name}: diskMB ${resources.diskMB} is above the plan's ${plan.maxDiskMbPerSandbox} MB`,
      )
    }
    return problems
  })
}

// Refuses to sync templates bigger than the E2B plan allows (capacity §3.3). Runs before anything
// is built, so a too-big template fails here instead of when a user opens a project.
export function checkTemplatesFitPlan(
  templates: TemplateDefinition[],
  plan = resolveSandboxPlan(),
): void {
  const problems = templatesOverPlan(templates, plan)
  if (problems.length) {
    throw new Error(
      `Templates too big for SANDBOX_PLAN=${plan.name}:\n  ${problems.join("\n  ")}`,
    )
  }
  console.log(
    `plan ${plan.name}: every template fits (at most ${plan.maxVcpuPerSandbox} vCPU, ${plan.maxMemoryMbPerSandbox} MB memory, ${plan.maxDiskMbPerSandbox} MB disk)`,
  )
}
