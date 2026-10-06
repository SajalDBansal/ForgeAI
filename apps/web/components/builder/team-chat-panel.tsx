"use client"

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import { Send } from "lucide-react"

import type { ProjectMember, TeamChatMessage } from "@/lib/build"
import { collaboratorInitials } from "@/lib/types"
import type { TeamChat } from "@/hooks/use-team-chat"

/** How close to the top (px) scrolling has to get before older messages are fetched. */
const LOAD_OLDER_THRESHOLD_PX = 80
/** How close to the bottom still counts as "following the conversation". */
const STICK_TO_BOTTOM_PX = 120
/** Consecutive messages from one person within this long share one name line. */
const GROUP_WINDOW_MS = 5 * 60_000

// Formats a message time as HH:MM (the day is on the separator above).
// Shown under the last message of each group.
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Returns the calendar day of a timestamp in the reader's time zone.
// Used to insert day separators and split groups.
function dayOf(iso: string): string {
  return new Date(iso).toDateString()
}

// Builds a day separator label such as "Today · Thursday, 24 Sep 2026".
// Prefixes Today/Yesterday when they apply.
function dayLabel(iso: string): string {
  const date = new Date(iso)
  const full = date.toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === new Date().toDateString())
    return `Today · ${full}`
  if (date.toDateString() === yesterday.toDateString())
    return `Yesterday · ${full}`
  return full
}

// Checks whether a message starts a new group (new author, new day, or a long gap).
// Groups share one name/time line.
function startsGroup(
  previous: TeamChatMessage | undefined,
  message: TeamChatMessage,
): boolean {
  if (!previous || previous.author?.id !== message.author?.id) return true
  if (dayOf(previous.createdAt) !== dayOf(message.createdAt)) return true
  return (
    new Date(message.createdAt).getTime() -
      new Date(previous.createdAt).getTime() >
    GROUP_WINDOW_MS
  )
}

interface MentionQuery {
  /** Where the "@" is. */
  start: number
  /** What has been typed after it, up to the caret. */
  query: string
}

// Finds the "@name" being typed just before the caret, which opens the people list.
// Only an "@" at the start or after whitespace counts, so email addresses don't trigger it.
function mentionQueryAt(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret)
  const start = before.lastIndexOf("@")
  if (start < 0) return null
  if (start > 0 && !/\s/.test(before[start - 1]!)) return null
  const query = before.slice(start + 1)
  if (query.length > 40 || /[\n@]/.test(query)) return null
  return { start, query }
}

// Escapes a string for use inside a regular expression.
// Used to match tagged names literally.
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Renders a message's text with each tagged "@Name" highlighted (more strongly when it's you).
// Longest names are matched first so "@Ann Lee" isn't read as "@Ann".
function MessageText({
  message,
  nameOf,
  myUserId,
  mine,
}: {
  message: TeamChatMessage
  nameOf: (id: string) => string | undefined
  myUserId: string
  mine: boolean
}) {
  const tags = message.mentions.flatMap((id) => {
    const name = nameOf(id)
    return name ? [{ id, name }] : []
  })
  if (!tags.length) return <>{message.content}</>

  tags.sort((a, b) => b.name.length - a.name.length)
  const idOf = new Map(tags.map((t) => [t.name, t.id]))
  const parts = message.content.split(
    new RegExp(
      `(@(?:${tags.map((t) => escapeRegExp(t.name)).join("|")}))`,
      "g",
    ),
  )

  return (
    <>
      {parts.map((part, i) => {
        const id = part.startsWith("@") ? idOf.get(part.slice(1)) : undefined
        if (!id) return <Fragment key={i}>{part}</Fragment>
        const me = id === myUserId
        return (
          <span
            key={i}
            className={`font-semibold ${me ? "bg-warning/30 rounded-sm px-0.5" : ""} ${mine ? "text-on-primary" : "text-ink"}`}
          >
            {part}
          </span>
        )
      })}
    </>
  )
}

// One message bubble, preceded by a day separator and/or the "New messages" divider when due.
// Name and time appear only under the last message of a group.
function TeamMessageItem({
  message: m,
  previous,
  next,
  isFirst,
  mine,
  isFirstUnread,
  dividerRef,
  nameOf,
  myUserId,
}: {
  message: TeamChatMessage
  previous: TeamChatMessage | undefined
  next: TeamChatMessage | undefined
  isFirst: boolean
  mine: boolean
  isFirstUnread: boolean
  dividerRef: RefObject<HTMLDivElement | null>
  nameOf: (id: string) => string | undefined
  myUserId: string
}) {
  const grouped = !startsGroup(previous, m)
  const endsGroup = !next || startsGroup(m, next)
  const newDay = isFirst || dayOf(previous!.createdAt) !== dayOf(m.createdAt)

  return (
    <>
      {newDay && (
        <div className="my-5 flex justify-center first:mt-0">
          <span className="bg-surface-card text-body rounded-full px-2.5 py-0.5 text-[10px] font-medium">
            {dayLabel(m.createdAt)}
          </span>
        </div>
      )}
      {isFirstUnread && (
        <div
          ref={dividerRef}
          className="text-warning my-4 flex items-center gap-2 text-[10px] tracking-wide uppercase"
        >
          <span className="bg-warning/40 h-px flex-1" />
          New messages
          <span className="bg-warning/40 h-px flex-1" />
        </div>
      )}
      <div
        className={`flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-1" : "mt-4"}`}
      >
        <div
          className={`max-w-[85%] min-w-0 ${mine ? "items-end" : "items-start"} flex flex-col`}
        >
          <div
            className={`rounded-sm px-3 py-2 text-sm break-words whitespace-pre-wrap ${
              mine ? "bg-ink text-on-primary" : "bg-surface-card text-ink"
            }`}
          >
            <MessageText
              message={m}
              nameOf={nameOf}
              myUserId={myUserId}
              mine={mine}
            />
          </div>
          {endsGroup && (
            <div className="text-mute mt-0.5 text-[10px] leading-tight">
              {!mine && (
                <span className="text-body">
                  {m.author?.name ?? "Former member"} ·{" "}
                </span>
              )}
              {formatTime(m.createdAt)}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// Dropdown of people matching the "@" being typed, above the composer.
// Uses mousedown so picking doesn't blur the textarea first.
function MentionPicker({
  candidates,
  pickIndex,
  onPick,
  onHover,
}: {
  candidates: ProjectMember[]
  pickIndex: number
  onPick: (member: ProjectMember) => void
  onHover: (index: number) => void
}) {
  return (
    <ul
      role="listbox"
      className="bg-canvas border-hairline-strong absolute inset-x-0 bottom-full z-20 mb-1 max-h-56 overflow-y-auto rounded-sm border py-1 shadow-lg"
    >
      {candidates.map((member, index) => (
        <li
          key={member.id}
          role="option"
          aria-selected={index === pickIndex}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(member)
          }}
          onMouseEnter={() => onHover(index)}
          className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 ${index === pickIndex ? "bg-surface-soft" : ""}`}
        >
          <span className="bg-surface-card text-ink grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold">
            {collaboratorInitials(member.name, member.email)}
          </span>
          <span className="min-w-0">
            <span className="text-ink block truncate text-sm">
              {member.name || member.email}
            </span>
            <span className="text-mute block truncate text-[10px]">
              {member.email}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

// Team chat composer with @-mention autocomplete (arrows/Enter/Tab/Escape).
// Enter sends, Shift+Enter adds a line; a failed send puts the text back.
function TeamComposer({
  members,
  myUserId,
  canPost,
  send,
}: {
  members: ProjectMember[]
  myUserId: string
  canPost: boolean
  send: TeamChat["send"]
}) {
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [picker, setPicker] = useState<MentionQuery | null>(null)
  const [pickIndex, setPickIndex] = useState(0)
  /** Who was picked from the list, by id; kept only if "@Name" is still in the text. */
  const [tagged, setTagged] = useState<Map<string, string>>(new Map())

  const candidates = useMemo(() => {
    if (!picker) return []
    const query = picker.query.toLowerCase()
    return members
      .filter((m) => m.id !== myUserId)
      .filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.email.toLowerCase().includes(query),
      )
      .slice(0, 6)
  }, [picker, members, myUserId])

  // Replaces the typed "@query" with "@Name " and remembers the tag.
  const pick = (member: ProjectMember) => {
    if (!picker) return
    const name = member.name || member.email
    const caret = picker.start + 1 + picker.query.length
    const inserted = `@${name} `
    setDraft(
      (text) => text.slice(0, picker.start) + inserted + text.slice(caret),
    )
    setTagged((current) => new Map(current).set(member.id, name))
    setPicker(null)
    // Place the caret after the name once React has updated the text.
    const at = picker.start + inserted.length
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(at, at))
  }

  // Sends the draft with the tags still present in the text.
  const submit = async () => {
    const text = draft.trim()
    if (!text || sending) return
    const mentions = [...tagged]
      .filter(([, name]) => text.includes(`@${name}`))
      .map(([id]) => id)
    setSending(true)
    setDraft("")
    const sent = await send(text, mentions)
    setSending(false)
    if (sent) setTagged(new Map())
    else setDraft(text)
  }

  return (
    <div className="hairline-t bg-canvas p-3">
      <div className="border-hairline focus-within:border-ink relative rounded-sm border">
        {candidates.length > 0 && (
          <MentionPicker
            candidates={candidates}
            pickIndex={pickIndex}
            onPick={pick}
            onHover={setPickIndex}
          />
        )}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setPicker(mentionQueryAt(e.target.value, e.target.selectionStart))
            setPickIndex(0)
          }}
          // The caret can move without typing (click, Home/End), so re-check the "@".
          onSelect={(e) =>
            setPicker(
              mentionQueryAt(
                e.currentTarget.value,
                e.currentTarget.selectionStart,
              ),
            )
          }
          onBlur={() => setPicker(null)}
          onKeyDown={(e) => {
            if (candidates.length > 0) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault()
                const step = e.key === "ArrowDown" ? 1 : -1
                setPickIndex(
                  (i) => (i + step + candidates.length) % candidates.length,
                )
                return
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault()
                pick(candidates[pickIndex] ?? candidates[0]!)
                return
              }
              if (e.key === "Escape") {
                e.preventDefault()
                setPicker(null)
                return
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
          disabled={!canPost}
          rows={2}
          maxLength={5000}
          placeholder={
            canPost ? "Message your team…" : "This project is archived."
          }
          className="placeholder:text-stone w-full resize-none bg-transparent px-3 py-2 text-sm focus:outline-none disabled:opacity-60"
        />
        <div className="flex items-center px-2 pb-2">
          <span className="text-mute ml-1 text-[11px]">
            ↵ send · ⇧↵ newline
          </span>
          <button
            onClick={() => void submit()}
            disabled={!canPost || sending || !draft.trim()}
            className="bg-ink text-on-primary disabled:bg-surface-card disabled:text-ash ml-auto flex h-7 items-center gap-1.5 rounded-sm px-3 text-xs"
          >
            <Send className="h-3 w-3" /> Send
          </button>
        </div>
      </div>
    </div>
  )
}

// The Team chat: collaborators talking to each other, separate from the agent chat.
// Opens at the first unread message (or the bottom), keeps its place, and pages back on scroll.
export function TeamChatPanel({
  chat,
  members,
  canPost,
}: {
  chat: TeamChat
  /** Everybody on the project: who can be tagged with "@". */
  members: ProjectMember[]
  canPost: boolean
}) {
  const { status, messages, hasMore, loadingOlder, myUserId, loadOlder } = chat

  // The first unread message when the chat opened; captured once, since reading moves the marker.
  const unreadFrom = (c: TeamChat) => (c.unread > 0 ? c.lastReadSeq + 1 : null)
  const [opened, setOpened] = useState(() =>
    status === "ready" ? { firstUnreadSeq: unreadFrom(chat) } : null,
  )
  if (opened === null && status === "ready")
    setOpened({ firstUnreadSeq: unreadFrom(chat) })
  const firstUnreadSeq = opened?.firstUnreadSeq ?? null
  const scrollRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)

  // Initial position: the "New messages" divider, the top (if every loaded message is unread), or the bottom.
  const positioned = useRef(false)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (positioned.current || !opened || !el) return
    positioned.current = true
    if (firstUnreadSeq !== null && dividerRef.current) {
      dividerRef.current.scrollIntoView({ block: "start" })
    } else if (
      firstUnreadSeq !== null &&
      messages[0] &&
      messages[0].seq > firstUnreadSeq
    ) {
      el.scrollTop = 0
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [opened, firstUnreadSeq, messages])

  // Keep the reader's place when older messages load above; follow new ones only if at the bottom (or mine).
  const firstSeq = messages[0]?.seq
  const lastSeq = messages[messages.length - 1]?.seq
  const previous = useRef({
    firstSeq,
    lastSeq,
    scrollHeight: 0,
    atBottom: true,
  })
  useLayoutEffect(() => {
    const el = scrollRef.current
    const was = previous.current
    if (el && positioned.current) {
      if (
        was.firstSeq !== undefined &&
        firstSeq !== undefined &&
        firstSeq < was.firstSeq
      ) {
        el.scrollTop += el.scrollHeight - was.scrollHeight
      } else if (lastSeq !== was.lastSeq) {
        const mine = messages[messages.length - 1]?.author?.id === myUserId
        if (was.atBottom || mine) el.scrollTop = el.scrollHeight
      }
    }
    previous.current = {
      firstSeq,
      lastSeq,
      scrollHeight: el?.scrollHeight ?? 0,
      atBottom: el
        ? el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX
        : true,
    }
  }, [firstSeq, lastSeq, messages, myUserId])

  // Tracks whether the reader is at the bottom, and loads older messages near the top.
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    previous.current.atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX
    previous.current.scrollHeight = el.scrollHeight
    // loadOlder ignores calls while one is in flight.
    if (el.scrollTop < LOAD_OLDER_THRESHOLD_PX && hasMore) void loadOlder()
  }

  // On a tall screen with nothing to scroll, keep loading until there is (or no more exist).
  useEffect(() => {
    const el = scrollRef.current
    if (
      status === "ready" &&
      hasMore &&
      !loadingOlder &&
      el &&
      el.scrollHeight <= el.clientHeight
    )
      void loadOlder()
  }, [status, hasMore, loadingOlder, messages.length, loadOlder])

  const nameOf = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m.name || m.email]))
    return (id: string) => byId.get(id)
  }, [members])

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Overlaid so it doesn't push the messages down. */}
        {loadingOlder && (
          <p className="bg-canvas border-hairline text-mute absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-sm border px-2 py-0.5 text-[11px]">
            Loading earlier messages…
          </p>
        )}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="dark-scroll flex-1 overflow-y-auto px-4 py-5"
        >
          {status === "loading" && (
            <p className="text-mute text-center text-xs">
              Loading the team chat…
            </p>
          )}
          {status === "error" && (
            <p className="text-mute text-center text-xs">
              Couldn&apos;t load the team chat.
            </p>
          )}
          {status === "ready" && messages.length === 0 && (
            <p className="text-mute mt-8 text-center text-xs">
              No messages yet. This chat is for the people on this project — the
              agent doesn&apos;t read it.
            </p>
          )}

          {messages.map((m, i) => (
            <TeamMessageItem
              key={m.id}
              message={m}
              previous={messages[i - 1]}
              next={messages[i + 1]}
              isFirst={i === 0}
              mine={m.author?.id === myUserId}
              isFirstUnread={m.seq === firstUnreadSeq}
              dividerRef={dividerRef}
              nameOf={nameOf}
              myUserId={myUserId}
            />
          ))}
        </div>
      </div>

      <TeamComposer
        members={members}
        myUserId={myUserId}
        canPost={canPost}
        send={chat.send}
      />
    </>
  )
}
