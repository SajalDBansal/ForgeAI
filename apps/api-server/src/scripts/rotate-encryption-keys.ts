import "dotenv/config"

import { prisma } from "@forgeAI/database"
import { rotateEncryptedSecrets } from "../service/secret-rotation.service.js"

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="))
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : undefined

const report = await rotateEncryptedSecrets({
  ...(Number.isFinite(limit) && limit && limit > 0 ? { limit } : {}),
})

console.log(
  JSON.stringify(
    {
      scanned: report.scanned,
      rotated: report.rotated,
      failures: report.failures,
    },
    null,
    2,
  ),
)

await prisma.$disconnect()

if (report.failures.length > 0) process.exitCode = 1
