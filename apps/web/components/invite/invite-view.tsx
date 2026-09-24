"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CircleCheck,
  LogOut,
  Mail,
  TriangleAlert,
  UserPlus,
} from "lucide-react"

import { PageCard } from "@/components/layout/page-card"
import { Wordmark } from "@/components/brand/wordmark"
import { useSession } from "@/hooks/use-session"
import { authClient } from "@/lib/auth-client"
import { refreshAppMetadata } from "@/lib/app-metadata"
import {
  acceptInvitationRequest,
  getInvitationPreviewRequest,
  rememberPendingInvite,
} from "@/lib/invite"
import { displayToast } from "@/lib/toast"
import type { InvitationPreview } from "@/lib/types"

type Phase =
  | "loading"
  | "invalid"
  | "needs-auth"
  | "wrong-account"
  | "ready"
  | "joining"
  | "joined"

// Builds the "?email=…" query that prefills the auth forms with the invited address.
// Empty when the invite preview hasn't loaded.
function emailQuery(preview: InvitationPreview | null): string {
  return preview ? `?email=${encodeURIComponent(preview.email)}` : ""
}

// Decides what to show for a valid invite given who (if anyone) is signed in.
// Only the invited email may accept it.
function previewPhase(
  signedInEmail: string | undefined,
  invitedEmail: string,
): Phase {
  if (!signedInEmail) return "needs-auth"
  return signedInEmail === invitedEmail ? "ready" : "wrong-account"
}

// The /invite/[token] page: previews an invitation and walks the user through joining.
// Handles signed-out, wrong-account, already-joined and invalid invites.
export function InviteView({ token }: { token: string }) {
  const router = useRouter()
  const { session, isPending: sessionPending } = useSession()
  const [phase, setPhase] = useState<Phase>("loading")
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  useEffect(() => {
    if (sessionPending) return
    let cancelled = false

    void (async () => {
      const result = await getInvitationPreviewRequest(token)
      if (cancelled) return

      if (result.ok) {
        setPreview(result.data)
        setPhase(previewPhase(session?.user.email, result.data.email))
        return
      }

      // An invalid preview may just mean we already joined (verification auto-redeems);
      // accepting is idempotent for members, so try once before showing an error.
      if (session) {
        const accept = await acceptInvitationRequest(token)
        if (!cancelled && accept.ok) {
          setWorkspaceId(accept.data.workspaceId)
          setPhase("joined")
          return
        }
      }
      if (!cancelled) {
        setErrorMessage(result.message)
        setPhase("invalid")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, session, sessionPending])

  useEffect(() => {
    if (phase !== "joined" || !workspaceId) return

    // Refresh the store so the just-joined workspace exists when we navigate to it.
    void refreshAppMetadata()

    const timer = setTimeout(
      () => router.push(`/workspaces/${workspaceId}`),
      1200,
    )
    return () => clearTimeout(timer)
  }, [phase, workspaceId, router])

  // Remembers the invite and sends the user to sign in or sign up.
  const goToAuth = (path: "signin" | "signup") => {
    rememberPendingInvite(token)
    router.push(`/${path}${emailQuery(preview)}`)
  }

  // Accepts the invite as the signed-in user.
  const join = async () => {
    setPhase("joining")
    const result = await acceptInvitationRequest(token)
    if (!result.ok) {
      displayToast(result.message)
      setPhase("ready")
      return
    }
    setWorkspaceId(result.data.workspaceId)
    setPhase("joined")
  }

  // Signs out so the invited account can sign in, keeping the invite pending.
  const switchAccounts = async () => {
    rememberPendingInvite(token)
    await authClient.signOut()
    router.push(`/signin${emailQuery(preview)}`)
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Wordmark scale={1.1} />
        </div>
        <PageCard className="p-6 text-center">
          {phase === "loading" && (
            <p className="text-mute text-sm">Loading invite…</p>
          )}

          {phase === "invalid" && (
            <>
              <TriangleAlert className="text-warning mx-auto h-6 w-6" />
              <h1 className="mt-3 text-lg font-bold">
                This invite isn&apos;t valid
              </h1>
              <p className="text-body mt-2 text-sm">{errorMessage}</p>
            </>
          )}

          {(phase === "needs-auth" ||
            phase === "wrong-account" ||
            phase === "ready" ||
            phase === "joining") &&
            preview && (
              <>
                <Mail className="text-mute mx-auto h-6 w-6" />
                <h1 className="mt-3 text-lg font-bold">
                  {preview.invitedByName} invited you to {preview.workspaceName}
                </h1>
                <p className="text-mute mt-1 text-sm">
                  As {preview.role === "EDITOR" ? "an editor" : "a viewer"} ·
                  sent to {preview.email}
                </p>

                {phase === "needs-auth" && (
                  <div className="mt-5 flex flex-col gap-2">
                    <button
                      onClick={() => goToAuth("signup")}
                      className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-10 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium"
                    >
                      <UserPlus className="h-4 w-4" /> Create an account to join
                    </button>
                    <button
                      onClick={() => goToAuth("signin")}
                      className="border-hairline hover:bg-surface-soft h-10 rounded-sm border px-4 text-sm font-medium"
                    >
                      I already have an account — sign in
                    </button>
                  </div>
                )}

                {phase === "wrong-account" && (
                  <div className="mt-5 space-y-3">
                    <p className="text-danger text-sm">
                      You&apos;re signed in as {session?.user.email}, but this
                      invite was sent to {preview.email}. You&apos;re not
                      authorized to accept it with this account.
                    </p>
                    <button
                      onClick={() => void switchAccounts()}
                      className="border-hairline hover:bg-surface-soft inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm border px-4 text-sm font-medium"
                    >
                      <LogOut className="h-4 w-4" /> Sign out and switch
                      accounts
                    </button>
                  </div>
                )}

                {(phase === "ready" || phase === "joining") && (
                  <button
                    onClick={() => void join()}
                    disabled={phase === "joining"}
                    className="bg-ink text-on-primary hover:bg-ink-deep mt-5 h-10 w-full rounded-sm text-sm font-medium disabled:opacity-50"
                  >
                    {phase === "joining"
                      ? "Joining…"
                      : `Join ${preview.workspaceName}`}
                  </button>
                )}
              </>
            )}

          {phase === "joined" && (
            <>
              <CircleCheck className="text-success mx-auto h-6 w-6" />
              <h1 className="mt-3 text-lg font-bold">You&apos;re in</h1>
              <p className="text-body mt-2 text-sm">
                Taking you to the workspace…
              </p>
            </>
          )}
        </PageCard>
      </div>
    </div>
  )
}
