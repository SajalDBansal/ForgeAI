import { prisma } from "@forgeAI/database"
import { TemplateInfo, TemplateListItem, toTemplateInfo } from "@forgeAI/shared"
import { visibleWorkspacesFilter } from "./workspace.service.js"

/** Exactly the columns the gallery needs — metadata and storage internals stay out. */
const templateListSelect = {
    id: true,
    name: true,
    tag: true,
    description: true,
    storageRef: true,
    previewImageUrl: true,
} as const

/**
 * Curated templates (workspaceId null) plus the private ones belonging to any
 * workspace the user owns or collaborates on.
 */
function visibleTemplatesFilter(userId: string) {
    return {
        OR: [{ workspaceId: null }, { workspace: visibleWorkspacesFilter(userId) }],
    }
}

export async function listTemplates(userId: string): Promise<TemplateListItem[]> {
    return prisma.template.findMany({
        where: visibleTemplatesFilter(userId),
        select: templateListSelect,
        orderBy: [{ uses: "desc" }, { name: "asc" }],
    })
}

export type TemplateDetailResult =
    | { ok: true; template: TemplateInfo }
    | { ok: false; reason: "not_found" | "invalid_metadata" }

export async function getTemplateDetail(userId: string, templateId: string): Promise<TemplateDetailResult> {
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
