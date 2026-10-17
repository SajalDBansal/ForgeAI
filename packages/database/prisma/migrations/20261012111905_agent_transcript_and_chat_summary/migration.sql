-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "transcript" JSONB;

-- CreateTable
CREATE TABLE "ProjectChatSummary" (
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "throughMessageId" TEXT NOT NULL,
    "throughCreatedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectChatSummary_pkey" PRIMARY KEY ("projectId")
);

-- AddForeignKey
ALTER TABLE "ProjectChatSummary" ADD CONSTRAINT "ProjectChatSummary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
