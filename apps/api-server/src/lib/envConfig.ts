function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const ENV_CONFIG = {
    PORT: requireEnv('PORT'),
    DATABASE_URL: requireEnv("DATABASE_URL"),
    BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: requireEnv("BETTER_AUTH_URL"),
    CLIENT_ORIGIN: requireEnv("CLIENT_ORIGIN"),
    GITHUB_CLIENT_ID: requireEnv("GITHUB_CLIENT_ID"),
    GITHUB_CLIENT_SECRET: requireEnv("GITHUB_CLIENT_SECRET"),
    GOOGLE_CLIENT_ID: requireEnv("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: requireEnv("GOOGLE_CLIENT_SECRET"),
    RESEND_API_KEY: requireEnv("RESEND_API_KEY"),
    EMAIL_FROM: requireEnv("EMAIL_FROM"),
}
