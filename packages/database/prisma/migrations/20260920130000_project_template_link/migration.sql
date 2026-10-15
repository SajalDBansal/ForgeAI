-- A project remembers the template it was created from, so opening its sandbox
-- can resolve the prebuilt E2B image without the client having to supply it.
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "templateId" TEXT;

-- CreateIndex
CREATE INDEX "Project_templateId_idx" ON "Project"("templateId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
