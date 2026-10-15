-- A workspace's editors can all create projects, so a project records who made it.
-- Nullable: projects that pre-date this column have no recorded author, and the
-- reference is cleared rather than cascading — a project belongs to its workspace,
-- not to the account that happened to create it.
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
