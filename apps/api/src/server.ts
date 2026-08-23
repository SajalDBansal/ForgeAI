import cors from "cors"
import express, { type Express, type Request, type Response } from "express"
import morgan from "morgan"

import { prisma } from "@repo/database"

export function createServer(): Express {
  const app = express()

  app.use(cors())
  app.use(express.json())
  app.use(morgan("dev"))

  app.get("/status", (_req: Request, res: Response) => {
    res.json({ ok: true })
  })

  app.get("/users", async (_req: Request, res: Response) => {
    const users = await prisma.user.findMany({ include: { posts: true } })
    res.json(users)
  })

  app.get("/message/:name", (req: Request, res: Response) => {
    res.json({ message: `hello ${req.params.name}` })
  })

  return app
}
