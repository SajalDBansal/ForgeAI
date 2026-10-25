import { FastifyInstance } from "fastify"
import {
  disconnectSupabaseHandler,
  supabaseCallbackHandler,
  supabaseDetailsHandler,
  supabaseStartHandler,
} from "../../controller/connections/supabase.controller.js"

// Registers Supabase OAuth start, callback, details and disconnect routes.
// Mounted under /connections/supabase.
export async function supabaseRouter(app: FastifyInstance): Promise<void> {
  // Account and accessible projects for the user's Supabase connection.
  app.get("/", supabaseDetailsHandler)

  // Redirects to Supabase's OAuth screen.
  app.get("/start", supabaseStartHandler)

  // Public: Supabase redirects the browser here.
  app.get("/callback", supabaseCallbackHandler)

  app.delete("/", disconnectSupabaseHandler)
}
