import { betterAuth } from "better-auth"
import { ENV_CONFIG } from "./envConfig.js"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { prisma } from "@forgeAI/database"
import { sendResetPasswordEmail, sendVerificationEmail } from "./email.js"
import { createDefaultWorkspace } from "../service/workspace.service.js"
import { redeemPendingInvitations } from "../service/invitation.service.js"
import { consumeLimit } from "./rate-limit.js"

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {
  github: {
    clientId: ENV_CONFIG.GITHUB_CLIENT_ID,
    clientSecret: ENV_CONFIG.GITHUB_CLIENT_SECRET,
  },
  google: {
    clientId: ENV_CONFIG.GOOGLE_CLIENT_ID,
    clientSecret: ENV_CONFIG.GOOGLE_CLIENT_SECRET,
  },
}

const useSecureCookies = ENV_CONFIG.BETTER_AUTH_URL.startsWith("https://")

// better-auth instance: email/password with verification, GitHub and Google sign-in.
// Creates the base workspace and redeems pending invitations for new users.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: ENV_CONFIG.BETTER_AUTH_URL,
  basePath: "/api/v1/auth",
  trustedOrigins: [ENV_CONFIG.CLIENT_ORIGIN],
  advanced: {
    useSecureCookies,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: useSecureCookies,
    },
  },

  // better-auth's built-in limits (on in production: e.g. 3 sign-in tries per 10 s per IP),
  // counted in Redis so every api-server copy shares one count instead of keeping its own.
  rateLimit: {
    customStorage: {
      consume: (key, rule) =>
        consumeLimit(`auth:${key}`, rule.max, rule.window),
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, token }) => {
      await sendResetPasswordEmail(user.email, token)
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, token }) => {
      await sendVerificationEmail(user.email, token)
    },
    onEmailVerification: async (user: { id: string; email: string }) => {
      await redeemPendingInvitations(user)
    },
  },

  socialProviders,

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await createDefaultWorkspace(user)
          if (user.emailVerified) {
            await redeemPendingInvitations(user)
          }
        },
      },
    },
  },
})
