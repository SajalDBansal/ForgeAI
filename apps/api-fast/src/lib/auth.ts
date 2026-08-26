import { betterAuth } from "better-auth";
import { ENV_CONFIG } from "./envConfig.js";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@forgeAI/database";
import { sendResetPasswordEmail, sendVerificationEmail } from "./email.js";
import { createDefaultWorkspace } from "../service/workspace.service.js";
import { redeemPendingInvitations } from "../service/invitation.service.js";

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {
    github: {
        clientId: ENV_CONFIG.GITHUB_CLIENT_ID,
        clientSecret: ENV_CONFIG.GITHUB_CLIENT_SECRET,
    },
    google: {
        clientId: ENV_CONFIG.GOOGLE_CLIENT_ID,
        clientSecret: ENV_CONFIG.GOOGLE_CLIENT_SECRET,
    }
}

export const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    baseURL: ENV_CONFIG.BETTER_AUTH_URL,
    basePath: "/api/v1/auth",
    trustedOrigins: [ENV_CONFIG.CLIENT_ORIGIN],

    emailAndPassword: {
        enabled: true,
        // Pending workspace invitations are redeemed by email address, so an
        // unverified address must not be able to claim someone else's invites.
        requireEmailVerification: true,
        sendResetPassword: async ({ user, url }) => {
            await sendResetPasswordEmail(user.email, url);
        },
    },

    emailVerification: {
        sendOnSignUp: true,
        sendVerificationEmail: async ({ user, url }) => {
            await sendVerificationEmail(user.email, url);
        },
        // Email/password users are unverified at signup, so this is where their
        // invitations get redeemed. Social logins arrive verified and redeem in the
        // user-create hook below.
        onEmailVerification: async (user: { id: string; email: string }) => {
            await redeemPendingInvitations(user);
        },
    },

    socialProviders,

    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    await createDefaultWorkspace(user);
                    if (user.emailVerified) {
                        await redeemPendingInvitations(user);
                    }
                },
            },
        },
    },
})