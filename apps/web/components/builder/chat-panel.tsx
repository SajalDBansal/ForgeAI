"use client"

import { useEffect, useRef, useState } from "react"
import type { PersonPresence } from "@forgeAI/shared"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@forgeAI/ui/components/tabs"

import { useOpenProject } from "@/lib/project-store"
import { useProjectMembers } from "@/hooks/use-project-members"
import { useTeamChat } from "@/hooks/use-team-chat"
import { ConversationPanel } from "@/components/builder/conversation-panel"
import { PeopleDialog } from "@/components/builder/people-dialog"
import { TeamChatPanel } from "@/components/builder/team-chat-panel"

type ChatTab = "agent" | "team"

// Left-hand panel with the Agent and Team conversations, plus the "N active" button.
// The Team tab shows an unread count.
export function ChatPanel({
  composer,
  setComposer,
  send,
  people,
  onOpenFile,
}: {
  composer: string
  setComposer: (s: string) => void
  send: (t?: string) => void
  /** Who is here now, from `usePresence`. */
  people: PersonPresence[]
  /** Opens a file in the editor (from the agent's knowledge search, Q6). */
  onOpenFile?: (path: string) => void
}) {
  const project = useOpenProject()
  const [tab, setTab] = useState<ChatTab>("agent")

  // Whether the panel is actually visible (it's hidden, not unmounted, when collapsed).
  const rootRef = useRef<HTMLDivElement>(null)
  const [onScreen, setOnScreen] = useState(true)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(entry?.isIntersecting ?? false),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const team = useTeamChat(project.id, tab === "team" && onScreen)
  const members = useProjectMembers(project.id)
  const [peopleOpen, setPeopleOpen] = useState(false)

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as ChatTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList className="bg-canvas hairline-b h-11 w-full shrink-0 justify-start gap-0 rounded-none p-0 px-2">
          <ChatTabTrigger value="agent" label="Agent" />
          <ChatTabTrigger value="team" label="Team" badge={team.unread} />
          <button
            onClick={() => setPeopleOpen(true)}
            className="border-hairline text-body hover:bg-surface-soft mr-1 ml-auto flex h-7 items-center gap-1.5 rounded-sm border px-2.5 text-[11px]"
          >
            <span aria-hidden className="bg-success h-1.5 w-1.5 rounded-full" />
            {people.length} active
          </button>
        </TabsList>

        {/* `data-activity` tells presence which chat is being written in. */}
        <TabsContent
          value="agent"
          data-activity="chat-agent"
          className="flex min-h-0 flex-col"
        >
          <ConversationPanel
            composer={composer}
            setComposer={setComposer}
            send={send}
            onOpenFile={onOpenFile}
          />
        </TabsContent>
        <TabsContent
          value="team"
          data-activity="chat-team"
          className="flex min-h-0 flex-col"
        >
          <TeamChatPanel
            chat={team}
            members={members}
            canPost={!project.archivedAt}
          />
        </TabsContent>
      </Tabs>

      {peopleOpen && (
        <PeopleDialog
          members={members}
          people={people}
          myUserId={team.myUserId}
          onClose={() => setPeopleOpen(false)}
        />
      )}
    </div>
  )
}

// One chat tab with an optional unread badge (capped at 99+).
// Used for the Agent and Team tabs.
function ChatTabTrigger({
  value,
  label,
  badge = 0,
}: {
  value: ChatTab
  label: string
  badge?: number
}) {
  return (
    <TabsTrigger
      value={value}
      className="text-mute data-[state=active]:text-ink data-[state=active]:after:bg-ink relative h-full flex-none rounded-none border-0 px-3.5 py-0 text-sm font-normal whitespace-nowrap shadow-none data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5"
    >
      {label}
      {badge > 0 && (
        <span
          aria-label={`${badge} unread`}
          className="bg-ink text-on-primary ml-1.5 h-4 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-medium"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </TabsTrigger>
  )
}
