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
        requireEmailVerification: true,
        sendResetPassword: async ({ user, token }) => {
            await sendResetPasswordEmail(user.email, token);
        },
    },

    emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: true,
        sendVerificationEmail: async ({ user, token }) => {
            await sendVerificationEmail(user.email, token);
        },
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