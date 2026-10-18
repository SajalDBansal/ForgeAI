CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BackgroundJob_queue_status_availableAt_idx" ON "BackgroundJob"("queue", "status", "availableAt");
CREATE INDEX "BackgroundJob_status_finishedAt_idx" ON "BackgroundJob"("status", "finishedAt");

CREATE TABLE "SecurityAuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "workspaceId" TEXT,
    "projectId" TEXT,
    "targetId" TEXT,
    "role" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SecurityAuditEvent_workspaceId_occurredAt_idx" ON "SecurityAuditEvent"("workspaceId", "occurredAt");
CREATE INDEX "SecurityAuditEvent_projectId_occurredAt_idx" ON "SecurityAuditEvent"("projectId", "occurredAt");
CREATE INDEX "SecurityAuditEvent_occurredAt_idx" ON "SecurityAuditEvent"("occurredAt");

CREATE TABLE "GithubRepositoryIntent" (
    "projectId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3),
    "githubRepoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GithubRepositoryIntent_pkey" PRIMARY KEY ("projectId")
);
CREATE UNIQUE INDEX "GithubRepositoryIntent_owner_name_key" ON "GithubRepositoryIntent"("owner", "name");
