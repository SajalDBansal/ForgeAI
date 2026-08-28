/*
  Warnings:

  - Made the column `issuer` on table `account` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;
