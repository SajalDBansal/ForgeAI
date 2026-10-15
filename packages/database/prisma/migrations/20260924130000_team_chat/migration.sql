-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "teamMessageSeq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TeamMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "authorId" TEXT,
    "contentEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamChatRead" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadSeq" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamChatRead_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateIndex
CREATE INDEX "TeamMessage_authorId_idx" ON "TeamMessage"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMessage_projectId_seq_key" ON "TeamMessage"("projectId", "seq");

-- CreateIndex
CREATE INDEX "TeamChatRead_userId_idx" ON "TeamChatRead"("userId");

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamChatRead" ADD CONSTRAINT "TeamChatRead_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamChatRead" ADD CONSTRAINT "TeamChatRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
