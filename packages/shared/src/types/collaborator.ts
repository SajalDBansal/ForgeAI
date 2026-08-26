import z from "zod";
import { inviteCollaboratorSchema, updateCollaboratorRoleSchema } from "../validations/collaborator.js";
import { CollaboratorRole, InvitationStatus } from "./enum.js";

export type InviteCollaboratorDataType = z.infer<typeof inviteCollaboratorSchema>

export type UpdateCollaboratorRoleDataType = z.infer<typeof updateCollaboratorRoleSchema>

export type Collaborator = {
    id: string;
    role: CollaboratorRole;
    userId: string;
    workspaceId: string;
    createdAt: Date;
    updatedAt: Date;
}

/** A collaborator joined with the profile fields the UI needs to render its row. */
export type WorkspaceCollaborator = {
    id: string;
    role: CollaboratorRole;
    createdAt: Date;
    user: {
        id: string;
        name: string;
        email: string;
        image: string | null;
    };
}

/**
 * A pending invite for an email address with no account yet. The token is a bearer
 * credential that only ever travels by email, so it is absent from this shape.
 */
export type WorkspaceInvitation = {
    id: string;
    email: string;
    role: CollaboratorRole;
    status: InvitationStatus;
    workspaceId: string;
    invitedByUserId: string;
    expiresAt: Date;
    createdAt: Date;
}

/**
 * What the invite landing page may show before sign-in. Anyone holding the link can
 * read this, so it carries no email address and nothing else identifying.
 */
export type InvitationPreview = {
    workspaceName: string;
    invitedByName: string;
    role: CollaboratorRole;
    expiresAt: Date;
}
