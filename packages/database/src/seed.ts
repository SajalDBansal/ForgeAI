import "dotenv/config"

import { prisma } from "./client.js"

async function main() {
  // Populate with the seed data later
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
