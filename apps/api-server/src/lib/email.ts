import { Resend } from "resend"

import { ENV_CONFIG } from "./envConfig.js"

const resend = new Resend(ENV_CONFIG.RESEND_API_KEY)

interface WorkspaceInviteEmail {
  to: string
  workspaceName: string
  invitedByName: string
}

// Sends one transactional email through Resend, throwing with `purpose` on failure.
// Shared by every email this service sends.
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  purpose: string,
  idempotencyKey?: string,
): Promise<void> {
  const { error } = await resend.emails.send(
    {
      from: ENV_CONFIG.EMAIL_FROM,
      to,
      subject,
      html,
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  )
  if (error) {
    throw new Error(`Failed to send ${purpose} email: ${error.message}`)
  }
}

// Emails a password-reset link.
// Called by better-auth when someone requests a reset.
export async function sendResetPasswordEmail(
  to: string,
  token: string,
): Promise<void> {
  const url = `${ENV_CONFIG.CLIENT_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`
  await sendEmail(
    to,
    "Reset your password",
    `
      <p>We received a request to reset your password.</p>
      <p><a href="${url}">Click here to choose a new password</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
    "reset password",
  )
}

// Tells an existing user they were added to a workspace.
// Sent when an invite targets an email that already has an account.
export async function sendWorkspaceAccessGrantedEmail(
  { to, workspaceName, invitedByName }: WorkspaceInviteEmail,
  idempotencyKey?: string,
): Promise<void> {
  const url = `${ENV_CONFIG.CLIENT_ORIGIN}/workspaces`
  await sendEmail(
    to,
    `${invitedByName} added you to ${workspaceName}`,
    `
      <p>${invitedByName} added you to the <strong>${workspaceName}</strong> workspace on ForgeAI.</p>
      <p><a href="${url}">Open the workspace</a></p>
    `,
    "workspace access",
    idempotencyKey,
  )
}

// Invites someone without an account to sign up and join a workspace.
// The link carries the invitation token redeemed after sign-up.
export async function sendWorkspaceInvitationEmail(
  {
    to,
    workspaceName,
    invitedByName,
    token,
  }: WorkspaceInviteEmail & { token: string },
  idempotencyKey?: string,
): Promise<void> {
  const url = `${ENV_CONFIG.CLIENT_ORIGIN}/invite/${token}`
  await sendEmail(
    to,
    `${invitedByName} invited you to ${workspaceName} on ForgeAI`,
    `
      <p>${invitedByName} invited you to collaborate on the <strong>${workspaceName}</strong> workspace on ForgeAI.</p>
      <p>You'll need an account to open it — creating one with this email address grants you access automatically.</p>
      <p><a href="${url}">Create your account and join</a></p>
      <p>If you weren't expecting this, you can safely ignore this email.</p>
    `,
    "workspace invitation",
    idempotencyKey,
  )
}

// Emails an address-verification link.
// Called by better-auth on sign-up and on sign-in while unverified.
export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<void> {
  const url = `${ENV_CONFIG.CLIENT_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`
  await sendEmail(
    to,
    "Verify your email address",
    `
      <p>Confirm this address to finish setting up your ForgeAI account.</p>
      <p><a href="${url}">Verify my email</a></p>
      <p>If you didn't create an account, you can safely ignore this email.</p>
    `,
    "verification",
  )
}
