-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "devCommand" TEXT,
ADD COLUMN     "devCommandById" TEXT,
ADD COLUMN     "devPort" INTEGER;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "devCommand" TEXT,
ADD COLUMN     "devPort" INTEGER,
ADD COLUMN     "installCommand" TEXT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_devCommandById_fkey" FOREIGN KEY ("devCommandById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
