import { prisma } from "@forgeAI/database"
import {
  TemplateDownload,
  TemplateInfo,
  TemplateListItem,
  toTemplateInfo,
} from "@forgeAI/shared"
import { ENV_CONFIG } from "../lib/envConfig.js"
import { r2 } from "../lib/r2.js"
import { visibleWorkspacesFilter } from "./workspace.service.js"

const templateListSelect = {
  id: true,
  name: true,
  tag: true,
  description: true,
  storageRef: true,
  previewImageUrl: true,
  workspaceId: true,
} as const

// Prisma filter for templates a user may see: public ones plus their workspaces' own.
// Shared by every template query.
export function visibleTemplatesFilter(userId: string) {
  return {
    OR: [{ workspaceId: null }, { workspace: visibleWorkspacesFilter(userId) }],
  }
}

// Lists the templates a user can see, most used first.
// Backs the templates gallery.
export async function listTemplates(
  userId: string,
): Promise<TemplateListItem[]> {
  return prisma.template.findMany({
    where: visibleTemplatesFilter(userId),
    select: templateListSelect,
    orderBy: [{ uses: "desc" }, { name: "asc" }],
  })
}

const DOWNLOAD_URL_TTL_SECONDS = ENV_CONFIG.TEMPLATE_DOWNLOAD_URL_TTL_SECONDS

export type TemplateDownloadResult =
  { ok: true; download: TemplateDownload } | { ok: false; reason: "not_found" }

// Returns a presigned R2 link to the latest version's source zip.
// The browser downloads from R2 directly, so the bucket stays private.
export async function getTemplateDownload(
  userId: string,
  templateId: string,
): Promise<TemplateDownloadResult> {
  const template = await prisma.template.findFirst({
    where: { id: templateId, ...visibleTemplatesFilter(userId) },
    select: { name: true, version: true, storageRef: true },
  })
  if (!template) return { ok: false, reason: "not_found" }

  const filename = `${template.name}-${template.version}.zip`
  const url = await r2.signDownloadUrl(
    template.storageRef,
    filename,
    DOWNLOAD_URL_TTL_SECONDS,
  )
  return {
    ok: true,
    download: { url, filename, expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  }
}

export type TemplateDetailResult =
  | { ok: true; template: TemplateInfo }
  | { ok: false; reason: "not_found" | "invalid_metadata" }

// Loads one visible template with its metadata flattened and validated.
// Reports `invalid_metadata` when the stored JSON doesn't match the schema.
export async function getTemplateDetail(
  userId: string,
  templateId: string,
): Promise<TemplateDetailResult> {
  const template = await prisma.template.findFirst({
    where: { id: templateId, ...visibleTemplatesFilter(userId) },
  })
  if (!template) return { ok: false, reason: "not_found" }

  try {
    return { ok: true, template: toTemplateInfo(template) }
  } catch {
    return { ok: false, reason: "invalid_metadata" }
  }
}
