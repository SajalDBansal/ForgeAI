-- GitHub becomes each project's version control (docs/GIT-SYNC-PLAN.md, Phase 1).

CREATE TYPE "CommitSource" AS ENUM ('FORGEAI', 'GITHUB', 'LEGACY');

ALTER TABLE "ProjectCommit" ADD COLUMN "source" "CommitSource" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN "authorLogin" TEXT,
ADD COLUMN "files" JSONB;

ALTER TABLE "RepoRef" ADD COLUMN "githubRepoId" TEXT,
ADD COLUMN "lastKnownSha" TEXT,
ADD COLUMN "githubHeadSha" TEXT,
ADD COLUMN "checkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "RepoRef_githubRepoId_key" ON "RepoRef"("githubRepoId");

-- Commits the tar-era sync already pushed are real git commits on GitHub: they take
-- GitHub's id as their hash, so History, links and rollback all use the one id.
UPDATE "ProjectCommit" SET "hash" = "githubSha", "source" = 'FORGEAI' WHERE "githubSha" IS NOT NULL;

-- A project whose latest commit reached GitHub is based on that commit.
UPDATE "RepoRef" r
SET "lastKnownSha" = c."hash", "githubHeadSha" = c."hash"
FROM "Project" p
JOIN "ProjectCommit" c ON c."projectId" = p."id" AND c."isHead" = true AND c."source" = 'FORGEAI'
WHERE p."repoId" = r."id" AND r."managed" = true;

ALTER TABLE "ProjectCommit" DROP COLUMN "githubSha";
