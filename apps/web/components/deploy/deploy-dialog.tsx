"use client"

import { useState } from "react"
import { Activity, Check, Globe, Rocket } from "lucide-react"

import { ModalShell, btnGhost, btnPrimary } from "@/components/modal/modal-shell"
import { displayToast } from "@/lib/toast"

const PROVIDERS = [
  { id: "forge", name: "ForgeAI Cloud", desc: "One click. Edge runtime. *.forge.app subdomain.", recommended: true },
  { id: "vercel", name: "Vercel", desc: "Push to a Vercel project from your linked GitHub repo." },
  { id: "netlify", name: "Netlify", desc: "Build hooks via the Netlify integration." },
  { id: "static", name: "Static export", desc: "Generate /dist and host anywhere." },
]

const STAGES = [
  "Resolving dependencies",
  "Building production bundle",
  "Optimizing assets",
  "Uploading to edge",
  "Verifying health checks",
]

export function DeployDialog({ projectName = "fintech-landing", onClose }: { projectName?: string; onClose?: () => void }) {
  const [provider, setProvider] = useState("forge")
  const [env, setEnv] = useState<"preview" | "production">("preview")
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState(-1)

  const run = () => {
    setRunning(true)
    setStage(0)
    STAGES.forEach((_, i) => setTimeout(() => setStage(i + 1), (i + 1) * 700))
    setTimeout(() => {
      displayToast("Deployed (demo)")
    }, (STAGES.length + 1) * 700)
  }

  return (
    <ModalShell
      title="Deploy project"
      subtitle={`Ship ${projectName} to the web. Frontend-only demo — no real deploy happens.`}
      onClose={running ? undefined : onClose}
      footer={
        <>
          <button
            onClick={() => (onClose ? onClose() : displayToast("Closed"))}
            disabled={running}
            className={`${btnGhost} disabled:pointer-events-none disabled:opacity-50`}
          >
            Cancel
          </button>
          <button onClick={run} disabled={running} className={btnPrimary}>
            <Rocket className="h-4 w-4" /> {running ? "Deploying…" : `Deploy to ${env}`}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-mute mb-2">Provider</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`p-3 text-left rounded-sm border ${provider === p.id ? "border-ink bg-surface-soft" : "border-hairline hover:bg-surface-soft"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{p.name}</span>
                  {p.recommended && (
                    <span className="text-[10px] uppercase tracking-widest bg-ink text-on-primary px-1.5 py-0.5 rounded-sm">
                      Reco
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-body">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-widest text-mute mb-2">Environment</div>
          <div className="flex gap-2">
            {(["preview", "production"] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEnv(e)}
                className={`h-9 px-4 rounded-sm border text-sm capitalize ${env === e ? "bg-ink text-on-primary border-ink" : "border-hairline"
                  }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface-soft border border-hairline rounded-sm p-3 text-xs flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-mute" />
          <span className="font-mono">
            https://{projectName}{env === "preview" ? "-preview" : ""}.forge.app
          </span>
        </div>

        {running && (
          <div className="bg-surface-dark text-on-dark-surface rounded-sm p-4 font-mono text-xs space-y-1.5">
            <div className="flex items-center gap-2 text-stone mb-1">
              <Activity className="h-3.5 w-3.5" /> deploy.log
            </div>
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span className={i < stage ? "text-success" : i === stage ? "text-warning" : "text-stone"}>
                  {i < stage ? <Check className="h-3.5 w-3.5" /> : i === stage ? "~" : "·"}
                </span>
                <span className={i <= stage ? "text-on-dark-surface" : "text-stone"}>{s}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
