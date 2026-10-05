import { Hourglass, Loader2, RotateCw, TriangleAlert } from "lucide-react"
import Link from "next/link"

import type { PodState } from "@/hooks/use-ensure-pod"

/** Every pod state except ready (a ready pod shows the real tab). */
type BootingState = Exclude<PodState, { status: "ready" }>

// Waiting, busy or error screen for Preview and Code while the sandbox starts.
// Mentions slow cold starts, keeps retrying when every environment is taken, and on the owner's
// limit lists their running projects so one can be closed.
export function SandboxBooting({
  state,
  onRetry,
  onDark = false,
}: {
  state: BootingState
  onRetry: () => void
  onDark?: boolean
}) {
  const heading = onDark ? "text-on-dark-surface" : "text-ink"
  const muted = onDark ? "text-ash-dark-surface" : "text-mute"
  const button = `mt-1 h-8 px-3 rounded-sm border text-xs font-medium inline-flex items-center gap-1.5 ${
    onDark
      ? "border-hairline-strong/30 text-on-dark-surface hover:bg-surface-dark-elevated"
      : "border-hairline text-ink hover:bg-surface-soft"
  }`

  if (state.status === "busy") {
    return (
      <div className="grid flex-1 place-items-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <Hourglass className={`h-5 w-5 ${muted}`} />
          <p className={`text-sm ${heading}`}>
            All environments are busy right now.
          </p>
          <p className={`text-xs ${muted}`}>
            We&apos;ll keep trying every 30 seconds and continue by ourselves as
            soon as one frees up. You can keep chatting meanwhile.
          </p>
          <button onClick={onRetry} className={button}>
            <RotateCw className="h-3.5 w-3.5" /> Try now
          </button>
        </div>
      </div>
    )
  }

  if (state.status === "error" && state.projects) {
    return (
      <div className="grid flex-1 place-items-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <TriangleAlert className="text-warning h-5 w-5" />
          <p className={`text-sm ${heading}`}>Too many environments running.</p>
          <p className={`text-xs ${muted}`}>{state.message}</p>
          {state.projects.length > 0 && (
            <ul className="flex flex-col gap-1">
              {state.projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/${project.id}`}
                    className={`text-xs underline underline-offset-2 ${heading}`}
                  >
                    {project.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <button onClick={onRetry} className={button}>
            <RotateCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="grid flex-1 place-items-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <TriangleAlert className="text-warning h-5 w-5" />
          <p className={`text-sm ${heading}`}>
            We couldn&apos;t start your environment.
          </p>
          <p className={`text-xs ${muted}`}>{state.message}</p>
          <button onClick={onRetry} className={button}>
            <RotateCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <Loader2 className={`h-5 w-5 animate-spin ${muted}`} />
        <p className={`text-sm ${heading}`}>
          Give us a minute — we&apos;re setting up your coding environment.
        </p>
        <p className={`text-xs ${muted}`}>
          {state.slow
            ? "Still working — a first-time setup takes longer than reopening a project. You can keep chatting while it finishes."
            : "Installing the template and booting a sandbox. This only happens once per project."}
        </p>
      </div>
    </div>
  )
}
