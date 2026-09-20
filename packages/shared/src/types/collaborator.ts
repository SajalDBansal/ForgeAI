import z from "zod"
import {
  inviteCollaboratorSchema,
  updateCollaboratorRoleSchema,
} from "../validations/collaborator.js"
import { CollaboratorRole, InvitationStatus } from "./enum.js"

export type InviteCollaboratorDataType = z.infer<
  typeof inviteCollaboratorSchema
>

export type UpdateCollaboratorRoleDataType = z.infer<
  typeof updateCollaboratorRoleSchema
>

export type Collaborator = {
  id: string
  role: CollaboratorRole
  userId: string
  workspaceId: string
  createdAt: Date
  updatedAt: Date
}

export type WorkspaceCollaborator = {
  id: string
  role: CollaboratorRole
  createdAt: Date
  user: {
    id: string
    name: string
    email: string
    image: string | null
  }
}

export type AccountCollaborator = WorkspaceCollaborator & {
  workspaceId: string
  workspaceName: string
}

export type WorkspaceInvitation = {
  id: string
  email: string
  role: CollaboratorRole
  status: InvitationStatus
  workspaceId: string
  invitedByUserId: string
  expiresAt: Date
  createdAt: Date
}

export type InvitationPreview = {
  email: string
  workspaceName: string
  invitedByName: string
  role: CollaboratorRole
  expiresAt: Date
}
