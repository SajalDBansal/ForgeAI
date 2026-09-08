"use client"

import { useState } from "react"
import { Activity, Check, Globe, Rocket } from "lucide-react"

import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"
import { displayToast } from "@/lib/toast"

const PROVIDERS = [
  {
    id: "forge",
    name: "ForgeAI Cloud",
    desc: "One click. Edge runtime. *.forge.app subdomain.",
    recommended: true,
  },
  {
    id: "vercel",
    name: "Vercel",
    desc: "Push to a Vercel project from your linked GitHub repo.",
  },
  {
    id: "netlify",
    name: "Netlify",
    desc: "Build hooks via the Netlify integration.",
  },
  {
    id: "static",
    name: "Static export",
    desc: "Generate /dist and host anywhere.",
  },
]

const STAGES = [
  "Resolving dependencies",
  "Building production bundle",
  "Optimizing assets",
  "Uploading to edge",
  "Verifying health checks",
]

// Dialog to pick a deploy provider and environment, with a simulated deploy log.
// Demo only: no real deployment happens.
export function DeployDialog({
  projectName = "fintech-landing",
  onClose,
}: {
  projectName?: string
  onClose?: () => void
}) {
  const [provider, setProvider] = useState("forge")
  const [env, setEnv] = useState<"preview" | "production">("preview")
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState(-1)

  // Steps through the fake deploy stages on a timer.
  const run = () => {
    setRunning(true)
    setStage(0)
    STAGES.forEach((_, i) => setTimeout(() => setStage(i + 1), (i + 1) * 700))
    setTimeout(
      () => {
        displayToast("Deployed (demo)")
      },
      (STAGES.length + 1) * 700,
    )
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
            <Rocket className="h-4 w-4" />{" "}
            {running ? "Deploying…" : `Deploy to ${env}`}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="text-mute mb-2 text-[11px] tracking-widest uppercase">
            Provider
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`rounded-sm border p-3 text-left ${
                  provider === p.id
                    ? "border-ink bg-surface-soft"
                    : "border-hairline hover:bg-surface-soft"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{p.name}</span>
                  {p.recommended && (
                    <span className="bg-ink text-on-primary rounded-sm px-1.5 py-0.5 text-[10px] tracking-widest uppercase">
                      Reco
                    </span>
                  )}
                </div>
                <p className="text-body mt-1 text-xs">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-mute mb-2 text-[11px] tracking-widest uppercase">
            Environment
          </div>
          <div className="flex gap-2">
            {(["preview", "production"] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEnv(e)}
                className={`h-9 rounded-sm border px-4 text-sm capitalize ${
                  env === e
                    ? "bg-ink text-on-primary border-ink"
                    : "border-hairline"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface-soft border-hairline flex items-center gap-2 rounded-sm border p-3 text-xs">
          <Globe className="text-mute h-3.5 w-3.5" />
          <span className="font-mono">
            https://{projectName}
            {env === "preview" ? "-preview" : ""}.forge.app
          </span>
        </div>

        {running && (
          <div className="bg-surface-dark text-on-dark-surface space-y-1.5 rounded-sm p-4 font-mono text-xs">
            <div className="text-stone mb-1 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" /> deploy.log
            </div>
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span
                  className={
                    i < stage
                      ? "text-success"
                      : i === stage
                        ? "text-warning"
                        : "text-stone"
                  }
                >
                  {i < stage ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : i === stage ? (
                    "~"
                  ) : (
                    "·"
                  )}
                </span>
                <span
                  className={i <= stage ? "text-on-dark-surface" : "text-stone"}
                >
                  {s}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
