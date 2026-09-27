import { Bracket } from "@/components/brand/bracket"
import { HeroComposer } from "@/components/home/hero-composer"
import { RecentProjects } from "@/components/home/recent-projects"
import { TemplatesGrid } from "@/components/home/templates-grid"
import { HomeFooter } from "@/components/home/footer"
import { PageShell } from "@/components/layout/page-shell"

// Home page: prompt composer, recent projects and templates.
// The starting point for building a new project.
export default function DashboardPage() {
  return (
    <PageShell breadcrumbs={[{ label: "dashboard" }]}>
      <div className="mx-auto max-w-3xl px-5 pt-16 pb-24 md:px-8">
        <div className="text-mute mb-3 flex items-center gap-2 text-xs">
          <Bracket kind="plus" /> News — agent v0.1.4 ships permission cards
        </div>
        <h1 className="text-3xl leading-[1.2] font-bold md:text-[38px]">
          What do you want to build?
        </h1>
        <p className="text-body mt-4 max-w-xl">
          ForgeAI plans, scaffolds, and iterates on websites, apps, dashboards,
          and prototypes. Describe it in one sentence — watch the agent work in
          the next screen.
        </p>

        <HeroComposer />
        <RecentProjects />
        <TemplatesGrid />
        <HomeFooter />
      </div>
    </PageShell>
  )
}
