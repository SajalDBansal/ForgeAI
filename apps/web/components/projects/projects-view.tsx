"use client"

import Link from "next/link"
import { Plus } from "lucide-react"

import { TopBar } from "@/components/layout/topbar"
import { ProjectsBrowser } from "@/components/projects/projects-browser"
import { useAppStore } from "@/lib/store"

// Projects page: every project across workspaces, with a "New project" action.
// Wraps ProjectsBrowser with workspace names shown.
export function ProjectsView() {
  const projects = useAppStore((s) => s.projects)

  return (
    <>
      <TopBar
        breadcrumbs={[{ label: "projects" }]}
        actions={
          <Link
            href="/"
            className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> New project
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="p-6">
          <ProjectsBrowser
            projects={projects}
            showWorkspace
            emptyAction={
              <Link
                href="/"
                className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-9 items-center gap-1.5 rounded-sm px-4 text-sm font-medium"
              >
                <Plus className="h-4 w-4" /> Create a project
              </Link>
            }
          />
        </div>
      </div>
    </>
  )
}
