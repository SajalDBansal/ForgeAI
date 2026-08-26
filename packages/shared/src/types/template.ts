import z from "zod";
import {
    createTemplateSchema,
    templateConnectionSchema,
    templateDbTableSchema,
    templateEnvVarSchema,
    templateMetadataSchema,
    templatePackageSchema,
    templateScreenSchema,
    updateTemplateSchema,
} from "../validations/template.js";

export type TemplatePackage = z.infer<typeof templatePackageSchema>

export type TemplateConnection = z.infer<typeof templateConnectionSchema>

export type TemplateScreen = z.infer<typeof templateScreenSchema>

export type TemplateEnvVar = z.infer<typeof templateEnvVarSchema>

export type TemplateDbTable = z.infer<typeof templateDbTableSchema>

export type TemplateMetadata = z.infer<typeof templateMetadataSchema>

export type CreateTemplateDataType = z.infer<typeof createTemplateSchema>

export type UpdateTemplateDataType = z.infer<typeof updateTemplateSchema>

export type Template = {
    id: string;
    name: string;
    description: string;
    tag: string;
    version: string;
    author: string;
    license: string;
    uses: number;
    storageRef: string;
    previewImageUrl: string | null;
    metadata: unknown;
    createdAt: Date;
    workspaceId: string | null;
}

export type TemplateListItem = Pick<Template, "id" | "name" | "tag" | "description" | "storageRef" | "previewImageUrl">

export type TemplateInfo = Omit<Template, "metadata"> & TemplateMetadata

export function toTemplateInfo(row: Template): TemplateInfo {
    const { metadata, ...columns } = row
    return {
        ...columns,
        ...templateMetadataSchema.parse(metadata),
    }
}
