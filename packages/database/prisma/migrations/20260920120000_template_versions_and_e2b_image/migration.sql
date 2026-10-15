-- Templates are now published from `packages/templates`, which owns both the R2
-- source zip and the prebuilt E2B image. The rows published by the old
-- `db:publish-template` script have neither, so they are dropped and re-published.
DELETE FROM "Template";

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "e2bTemplateId" TEXT NOT NULL,
ADD COLUMN     "contentHash" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "e2bTemplateId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_version_key" ON "TemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Template_name_key" ON "Template"("name");

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
