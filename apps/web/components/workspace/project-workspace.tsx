"use client"

import { useEffect } from "react"
import Link from "next/link"

import { useAppStore } from "@/lib/store"
import { useProjectStore } from "@/lib/project-store"
import { useLoadProject } from "@/hooks/use-load-project"
import { ProjectSocketProvider } from "@/hooks/use-project-socket"
import { BuilderWorkspace } from "@/components/builder/builder-workspace"
import { PlanWorkspace } from "@/components/builder-plan/plan-workspace"

// Full-page error shown when a project can't be opened.
// Offers a link back to the dashboard.
function ProjectOpenError({ message }: { message: string | null }) {
  return (
    <div className="bg-canvas flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-ink text-2xl font-bold">
          Couldn&apos;t open this project
        </h1>
        <p className="text-body mt-2 text-sm">
          {message ??
            "This project doesn't exist, or you don't have access to it."}
        </p>
        <Link
          href="/"
          className="text-ink mt-4 inline-block text-sm underline underline-offset-4"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}

// Loads a project and renders the Plan or Build workspace inside its live socket.
// Shows a loading screen until the project is in the store.
export function ProjectWorkspace({ projectId }: { projectId: string }) {
  useLoadProject(projectId)
  const status = useProjectStore((s) => s.status)
  const error = useProjectStore((s) => s.error)
  const mode = useProjectStore((s) =>
    s.projectId === projectId ? s.project?.mode : undefined,
  )
  const updateOpenProject = useProjectStore((s) => s.updateProject)
  const updateProject = useAppStore((s) => s.updateProject)
  const touchProject = useAppStore((s) => s.touchProject)

  useEffect(() => {
    touchProject(projectId)
  }, [projectId, touchProject])

  if (status === "error" || (status === "ready" && !mode)) {
    return <ProjectOpenError message={error} />
  }

  // Every section reads the project from the store, so wait until it's loaded.
  if (status !== "ready" || !mode) {
    return (
      <div className="bg-canvas text-mute flex min-h-screen items-center justify-center text-sm">
        Loading project…
      </div>
    )
  }

  // One live socket per project feeds every section through the project store.
  if (mode === "PLAN") {
    return (
      <ProjectSocketProvider projectId={projectId}>
        <PlanWorkspace
          onApproveBuild={() => {
            const patch = { mode: "BUILD", status: "BUILDING" } as const
            updateOpenProject(patch)
            updateProject(projectId, {
              ...patch,
              updatedAt: new Date().toISOString(),
            })
          }}
        />
      </ProjectSocketProvider>
    )
  }

  return (
    <ProjectSocketProvider projectId={projectId}>
      <BuilderWorkspace />
    </ProjectSocketProvider>
  )
}
