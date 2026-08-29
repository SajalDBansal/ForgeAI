"use client"

import Link from "next/link"
import { Plus } from "lucide-react"

import { TopBar } from "@/components/layout/topbar"
import { ProjectsBrowser } from "@/components/projects/projects-browser"
import { useAppStore } from "@/lib/store"

export function ProjectsView() {
  const projects = useAppStore((s) => s.projects)

  return (
    <>
      <TopBar
        breadcrumbs={[{ label: "projects" }]}
        actions={
          <Link
            href="/"
            className="h-9 px-3 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> New project
          </Link>
        }
      />
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="p-6">
          <ProjectsBrowser
            projects={projects}
            showWorkspace
            emptyAction={
              <Link
                href="/"
                className="h-9 px-4 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center gap-1.5"
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
