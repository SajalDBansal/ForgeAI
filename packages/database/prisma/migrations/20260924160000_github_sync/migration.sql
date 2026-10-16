-- Repositories ForgeAI creates and pushes every commit to, and where each commit landed.
ALTER TABLE "RepoRef" ADD COLUMN "managed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ProjectCommit" ADD COLUMN "githubSha" TEXT;
