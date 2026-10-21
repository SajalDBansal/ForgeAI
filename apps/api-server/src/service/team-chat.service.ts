import { Prisma, prisma } from "@forgeAI/database"
import type {
  CreateTeamMessageDataType,
  ListTeamMessagesQuery,
  ProjectMember,
  TeamChatPage,
  TeamMessage,
} from "@forgeAI/shared"
import { decryptTeamMessage, encryptTeamMessage } from "../lib/encryption.js"
import { publishProjectEvent } from "../lib/project-events.js"
import { liveProjectFilter } from "./build.service.js"

// Team chat: collaborators talking to each other (separate from the agent chat).
// Stored encrypted, numbered per project with no gaps, read newest-first in pages.

const include = {
  author: { select: { id: true, name: true, image: true } },
} as const
type TeamMessageRow = Prisma.TeamMessageGetPayload<{ include: typeof include }>

// Decrypts a stored team message into the API shape.
// An unreadable row shows a placeholder instead of breaking the whole chat.
function toTeamMessage(row: TeamMessageRow): TeamMessage {
  let content: string
  try {
    content = decryptTeamMessage(row.contentEnc)
  } catch {
    // Only happens if TEAM_CHAT_ENCRYPTION_KEY changed since it was written.
    content = "This message can't be read."
  }
  return {
    id: row.id,
    projectId: row.projectId,
    seq: row.seq,
    author: row.author,
    content,
    mentions: row.mentions,
    createdAt: row.createdAt,
  }
}

const memberSelect = { id: true, name: true, email: true, image: true } as const

// Lists everyone who can open the project: the owner first, then collaborators by join date.
// Caller must already have checked read access.
export async function listProjectMembers(
  projectId: string,
): Promise<ProjectMember[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      workspace: {
        select: {
          user: { select: memberSelect },
          collaborators: {
            select: { role: true, user: { select: memberSelect } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  })
  if (!project) return []
  const { user: owner, collaborators } = project.workspace
  return [
    { ...owner, role: "OWNER" },
    ...collaborators.map(({ role, user }) => ({ ...user, role })),
  ]
}

// Moves the user's read marker forward to `seq` (never back, never past the last message).
// Runs inside the send transaction or on its own when marking read.
async function advanceRead(
  db: Prisma.TransactionClient,
  projectId: string,
  userId: string,
  seq: number,
): Promise<void> {
  await db.$executeRaw`
        INSERT INTO "TeamChatRead" ("projectId", "userId", "lastReadSeq", "updatedAt")
        VALUES (${projectId}, ${userId},
                LEAST(${seq}, (SELECT "teamMessageSeq" FROM "Project" WHERE "id" = ${projectId})), now())
        ON CONFLICT ("projectId", "userId") DO UPDATE
        SET "lastReadSeq" = GREATEST("TeamChatRead"."lastReadSeq", EXCLUDED."lastReadSeq"),
            "updatedAt" = now()`
}

// Returns a page of the Team chat (oldest first) with the user's read marker and unread count.
// Without `before` it's the newest page, which the chat opens on.
export async function listTeamMessages(
  projectId: string,
  userId: string,
  query: ListTeamMessagesQuery,
): Promise<TeamChatPage> {
  const [rows, read] = await Promise.all([
    prisma.teamMessage.findMany({
      where: { projectId, ...(query.before && { seq: { lt: query.before } }) },
      orderBy: { seq: "desc" },
      take: query.limit + 1,
      include,
    }),
    prisma.teamChatRead.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { lastReadSeq: true },
    }),
  ])
  const lastReadSeq = read?.lastReadSeq ?? 0

  // Own messages never count; the OR keeps deleted-author rows that `not` alone would skip.
  const unread = await prisma.teamMessage.count({
    where: {
      projectId,
      seq: { gt: lastReadSeq },
      OR: [{ authorId: null }, { authorId: { not: userId } }],
    },
  })

  return {
    messages: rows.slice(0, query.limit).reverse().map(toTeamMessage),
    hasMore: rows.length > query.limit,
    lastReadSeq,
    unread,
  }
}

// Encrypts and stores a team message with the next sequence number, then broadcasts it.
// Mentions of people not on the project are silently dropped.
export async function createTeamMessage(
  projectId: string,
  userId: string,
  input: CreateTeamMessageDataType,
): Promise<TeamMessage> {
  const contentEnc = encryptTeamMessage(input.content)
  const members = new Set(
    (await listProjectMembers(projectId)).map((m) => m.id),
  )
  const mentions = [...new Set(input.mentions)].filter(
    (id) => members.has(id) && id !== userId,
  )

  const row = await prisma.$transaction(async (tx) => {
    // Row-locking increment gives concurrent senders consecutive numbers; raw so updatedAt isn't touched.
    const [next] = await tx.$queryRaw<{ teamMessageSeq: number }[]>`
            UPDATE "Project" SET "teamMessageSeq" = "teamMessageSeq" + 1
            WHERE "id" = ${projectId}
            RETURNING "teamMessageSeq"`
    if (!next) throw new Error(`Project ${projectId} not found`)

    const created = await tx.teamMessage.create({
      data: {
        projectId,
        seq: next.teamMessageSeq,
        authorId: userId,
        contentEnc,
        mentions,
      },
      include,
    })
    // Whoever writes has read everything up to their own message.
    await advanceRead(tx, projectId, userId, created.seq)
    return created
  })

  const message = toTeamMessage(row)
  publishProjectEvent({
    type: "team.message.created",
    projectId,
    teamMessage: message,
  })
  return message
}

// Checks whether the user may post: any member (viewers too) of a non-archived project.
// Talking about a project is the point of Team chat, even for viewers.
export async function canPostTeamMessage(
  userId: string,
  projectId: string,
): Promise<boolean> {
  return (
    (await prisma.project.count({
      where: liveProjectFilter(userId, projectId),
    })) > 0
  )
}

// Marks the Team chat read up to `seq` for this user.
// Backs PUT /project/:id/team-messages/read.
export async function markTeamChatRead(
  projectId: string,
  userId: string,
  seq: number,
): Promise<void> {
  await advanceRead(prisma, projectId, userId, seq)
}
