-- AlterTable
ALTER TABLE "TeamMessage" ADD COLUMN     "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[];
