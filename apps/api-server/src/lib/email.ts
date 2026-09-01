import { Resend } from "resend"

import { ENV_CONFIG } from "./envConfig.js"

const resend = new Resend(ENV_CONFIG.RESEND_API_KEY)

export async function sendResetPasswordEmail(to: string, token: string): Promise<void> {
    const url = `${ENV_CONFIG.CLIENT_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`
    const { error } = await resend.emails.send({
        from: ENV_CONFIG.EMAIL_FROM,
        to,
        subject: "Reset your password",
        html: `
      <p>We received a request to reset your password.</p>
      <p><a href="${url}">Click here to choose a new password</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
    })

    if (error) {
        throw new Error(`Failed to send reset password email: ${error.message}`)
    }
}

interface WorkspaceInviteEmail {
    to: string
    workspaceName: string
    invitedByName: string
}

export async function sendWorkspaceAccessGrantedEmail({ to, workspaceName, invitedByName }: WorkspaceInviteEmail): Promise<void> {
    const url = `${ENV_CONFIG.CLIENT_ORIGIN}/workspaces`
    const { error } = await resend.emails.send({
        from: ENV_CONFIG.EMAIL_FROM,
        to,
        subject: `${invitedByName} added you to ${workspaceName}`,
        html: `
      <p>${invitedByName} added you to the <strong>${workspaceName}</strong> workspace on ForgeAI.</p>
      <p><a href="${url}">Open the workspace</a></p>
    `,
    })

    if (error) {
        throw new Error(`Failed to send workspace access email: ${error.message}`)
    }
}

export async function sendWorkspaceInvitationEmail({ to, workspaceName, invitedByName, token }: WorkspaceInviteEmail & { token: string }): Promise<void> {
    const url = `${ENV_CONFIG.CLIENT_ORIGIN}/invite/${token}`
    const { error } = await resend.emails.send({
        from: ENV_CONFIG.EMAIL_FROM,
        to,
        subject: `${invitedByName} invited you to ${workspaceName} on ForgeAI`,
        html: `
      <p>${invitedByName} invited you to collaborate on the <strong>${workspaceName}</strong> workspace on ForgeAI.</p>
      <p>You'll need an account to open it — creating one with this email address grants you access automatically.</p>
      <p><a href="${url}">Create your account and join</a></p>
      <p>If you weren't expecting this, you can safely ignore this email.</p>
    `,
    })

    if (error) {
        throw new Error(`Failed to send workspace invitation email: ${error.message}`)
    }
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
    const url = `${ENV_CONFIG.CLIENT_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`
    const { error } = await resend.emails.send({
        from: ENV_CONFIG.EMAIL_FROM,
        to,
        subject: "Verify your email address",
        html: `
      <p>Confirm this address to finish setting up your ForgeAI account.</p>
      <p><a href="${url}">Verify my email</a></p>
      <p>If you didn't create an account, you can safely ignore this email.</p>
    `,
    })

    if (error) {
        throw new Error(`Failed to send verification email: ${error.message}`)
    }
}
