import z from "zod";
import { updateWorkspaceSchema } from "../validations/workspace.js";
import { WorkspaceCollaborator } from "./collaborator.js";
import { Project } from "./project.js";

export type UpdateWorkspaceDataType = z.infer<typeof updateWorkspaceSchema>

export type Workspace = {
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    description: string | null;
    deleteable: boolean;
    archivedAt: Date | null;
}

export type WorkspaceDetail = Workspace & {
    projects: Project[];
    collaborators: WorkspaceCollaborator[];
}
