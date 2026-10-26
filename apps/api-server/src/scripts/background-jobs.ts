import "dotenv/config"
import { prisma } from "@forgeAI/database"
import { retryFailedJob, workerRoleSchema } from "@forgeAI/jobs"

try {
  const [command, value] = process.argv.slice(2)
  if (command === "retry" && value) {
    console.log({ retried: await retryFailedJob(value), id: value })
  } else if (command === "list") {
    const role = value ? workerRoleSchema.parse(value) : undefined
    console.table(
      await prisma.backgroundJob.findMany({
        where: {
          ...(role && { queue: role }),
          status: { in: ["PENDING", "FAILED"] },
        },
        select: {
          id: true,
          queue: true,
          status: true,
          attempts: true,
          createdAt: true,
          errorCode: true,
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
    )
  } else throw new Error("Usage: jobs list [role] | jobs retry <id>")
} finally {
  await prisma.$disconnect()
}
