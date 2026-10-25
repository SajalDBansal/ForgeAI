import { FastifyInstance } from "fastify"
import {
  disconnectGithubHandler,
  githubAuthorizeHandler,
  githubCallbackHandler,
  githubDetailsHandler,
  githubStartHandler,
} from "../../controller/connections/github.controller.js"

// Registers GitHub App install, authorize, callback and disconnect routes.
// Mounted under /connections/github.
export async function githubRouter(app: FastifyInstance): Promise<void> {
  // Account and accessible repos for the user's GitHub connection.
  app.get("/", githubDetailsHandler)

  // Redirects to GitHub's App install screen.
  app.get("/start", githubStartHandler)

  // Lets the App act as the user, needed to create project repos.
  app.get("/authorize", githubAuthorizeHandler)

  // Public: GitHub redirects the browser here.
  app.get("/callback", githubCallbackHandler)

  app.delete("/", disconnectGithubHandler)
}
