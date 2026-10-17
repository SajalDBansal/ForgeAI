-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_INPUT', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FileChangeAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED');

-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('LLM_TOKENS', 'SANDBOX_SECONDS');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "runId" TEXT;

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "model" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "tool" TEXT NOT NULL,
    "input" JSONB,
    "outputSummary" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentFileChange" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "action" "FileChangeAction" NOT NULL,
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentFileChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "runId" TEXT,
    "kind" "UsageKind" NOT NULL,
    "model" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_projectId_createdAt_idx" ON "AgentRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");

-- CreateIndex
CREATE INDEX "AgentRun_requestedById_idx" ON "AgentRun"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "AgentStep_runId_seq_key" ON "AgentStep"("runId", "seq");

-- CreateIndex
CREATE INDEX "AgentFileChange_runId_idx" ON "AgentFileChange"("runId");

-- CreateIndex
CREATE INDEX "UsageEvent_workspaceId_createdAt_idx" ON "UsageEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_projectId_idx" ON "UsageEvent"("projectId");

-- CreateIndex
CREATE INDEX "UsageEvent_runId_idx" ON "UsageEvent"("runId");

-- CreateIndex
CREATE INDEX "ChatMessage_runId_idx" ON "ChatMessage"("runId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentFileChange" ADD CONSTRAINT "AgentFileChange_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
