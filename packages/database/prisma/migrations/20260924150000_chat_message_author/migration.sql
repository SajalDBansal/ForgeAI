-- Who sent each Agent-chat message, shown under it.
ALTER TABLE "ChatMessage" ADD COLUMN "authorId" TEXT;

CREATE INDEX "ChatMessage_authorId_idx" ON "ChatMessage"("authorId");

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing projects: the message that opened the conversation is the initial prompt,
-- written by whoever created the project. Later messages from before this column
-- have no record of their sender and stay unattributed.
UPDATE "ChatMessage" m
SET "authorId" = p."createdById"
FROM "Project" p
WHERE m."projectId" = p."id"
  AND m."role" = 'USER'
  AND m."authorId" IS NULL
  AND m."content" = p."initialPrompt"
  AND p."createdById" IS NOT NULL;
