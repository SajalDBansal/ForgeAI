
-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "author" TEXT NOT NULL,
ADD COLUMN     "license" TEXT NOT NULL,
ADD COLUMN     "uses" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Collaborator_workspaceId_userId_key" ON "Collaborator"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "Template_tag_idx" ON "Template"("tag");

