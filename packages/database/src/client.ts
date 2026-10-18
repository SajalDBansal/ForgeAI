import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

import { PrismaClient } from "../generated/client/index.js"
import { ENV_CONFIG } from "./envConfig.js"

// Reuses one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const pool = new Pool({ connectionString: ENV_CONFIG.DATABASE_URL })
const adapter = new PrismaPg(pool)

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (ENV_CONFIG.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export * from "../generated/client/index.js"
export { lockProjectRow } from "./project-lock.js"
