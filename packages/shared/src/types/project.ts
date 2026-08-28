import z from "zod";
import { createProjectSchema, updateProjectSchema } from "../validations/project.js";
import { ProjectMode, ProjectSource, ProjectStatus } from "./enum.js";

export type CreateProjectDataType = z.infer<typeof createProjectSchema>

export type UpdateProjectDataType = z.infer<typeof updateProjectSchema>

export type Project = {
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    workspaceId: string;
    status: ProjectStatus;
    description: string | null;
    archivedAt: Date | null;
    initialPrompt: string;
    starred: boolean;
    stack: string[];
    mode: ProjectMode;
    source: ProjectSource;
    repoId: string | null;
    lastUsed: Date;
}