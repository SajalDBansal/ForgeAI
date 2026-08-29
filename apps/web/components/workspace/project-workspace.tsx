"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import type { Project, ProjectMode } from "@/lib/types"
import { useAppStore, useProject } from "@/lib/store"
import { SESSION_KEYS } from "@/lib/builder-data"
import { BuilderWorkspace } from "@/components/builder/builder-workspace"
import { PlanWorkspace } from "@/components/builder-plan/plan-workspace"

export function ProjectWorkspace({
  projectId,
  project: serverProject,
}: {
  projectId: string
  project: Project | null
}) {
  const storeProject = useProject(projectId)
  const project = serverProject ?? storeProject ?? null
  const updateProject = useAppStore((s) => s.updateProject)
  const touchProject = useAppStore((s) => s.touchProject)

  const [mode, setMode] = useState<ProjectMode>(project?.mode ?? "BUILD")

  useEffect(() => {
    if (project) touchProject(project.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    const override = sessionStorage.getItem(`forge.mode.${projectId}`)
    if (override === "BUILD" || override === "PLAN") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a project's mode can be overridden for this tab only (e.g. after "Approve & build"), which lives in sessionStorage and isn't readable during SSR/first render.
      setMode(override)
      return
    }
    if (project) {
      setMode(project.mode)
      return
    }
    const stored = sessionStorage.getItem(SESSION_KEYS.mode)
    if (stored === "BUILD" || stored === "PLAN") setMode(stored)
  }, [projectId, project])

  if (!project && projectId !== "new") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-ink">Project not found</h1>
          <p className="mt-2 text-sm text-body">
            This project doesn&apos;t exist, or was created in a different browser session.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-ink underline underline-offset-4">
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (mode === "PLAN") {
    return (
      <PlanWorkspace
        projectId={projectId}
        project={project}
        onApproveBuild={() => {
          sessionStorage.setItem(`forge.mode.${projectId}`, "BUILD")
          setMode("BUILD")
          if (project) updateProject(project.id, { mode: "BUILD", status: "BUILDING", updatedAt: new Date().toISOString() })
        }}
      />
    )
  }

  return <BuilderWorkspace projectId={projectId} project={project} />
}
