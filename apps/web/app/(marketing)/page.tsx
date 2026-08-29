import { Bracket } from "@/components/brand/bracket"
import { HeroComposer } from "@/components/home/hero-composer"
import { RecentProjects } from "@/components/home/recent-projects"
import { TemplatesGrid } from "@/components/home/templates-grid"
import { HomeFooter } from "@/components/home/footer"
import { PageShell } from "@/components/layout/page-shell"

export default function DashboardPage() {
  return (
    <PageShell breadcrumbs={[{ label: "dashboard" }]}>
      <div className="max-w-3xl mx-auto px-5 md:px-8 pt-16 pb-24">
        <div className="text-xs text-mute mb-3 flex items-center gap-2">
          <Bracket kind="plus" /> News — agent v0.1.4 ships permission cards
        </div>
        <h1 className="text-3xl md:text-[38px] font-bold leading-[1.2]">
          What do you want to build?
        </h1>
        <p className="mt-4 text-body max-w-xl">
          ForgeAI plans, scaffolds, and iterates on websites, apps, dashboards, and prototypes.
          Describe it in one sentence — watch the agent work in the next screen.
        </p>

        <HeroComposer />
        <RecentProjects />
        <TemplatesGrid />
        <HomeFooter />
      </div>
    </PageShell>
  )
}
