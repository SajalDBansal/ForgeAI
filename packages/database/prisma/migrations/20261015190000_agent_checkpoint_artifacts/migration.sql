CREATE TABLE "AgentCheckpointArtifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "commit" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentCheckpointArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentCheckpointArtifact_key_key" ON "AgentCheckpointArtifact"("key");
CREATE UNIQUE INDEX "AgentCheckpointArtifact_runId_seq_key" ON "AgentCheckpointArtifact"("runId", "seq");
CREATE INDEX "AgentCheckpointArtifact_projectId_idx" ON "AgentCheckpointArtifact"("projectId");

ALTER TABLE "AgentCheckpointArtifact" ADD CONSTRAINT "AgentCheckpointArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
