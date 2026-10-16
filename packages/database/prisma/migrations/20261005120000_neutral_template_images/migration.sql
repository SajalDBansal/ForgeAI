-- Neutral names for template images (work plan F7). The column held E2B's image name, but any
-- provider's image reference fits it. Renamed, not dropped, so existing rows keep their values.
ALTER TABLE "Template" RENAME COLUMN "e2bTemplateId" TO "imageRef";
ALTER TABLE "TemplateVersion" RENAME COLUMN "e2bTemplateId" TO "imageRef";

-- Which provider an image was built for. Every existing image was built on E2B.
ALTER TABLE "Template" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'e2b';
ALTER TABLE "TemplateVersion" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'e2b';

-- The exact Dockerfile each version was built from (F8), so any version can be rebuilt on another
-- provider. Empty for versions built before templates were Dockerfiles.
ALTER TABLE "TemplateVersion" ADD COLUMN "dockerfile" TEXT;
