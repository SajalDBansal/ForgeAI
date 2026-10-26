import type { FastifyInstance } from "fastify"
import {
  privatePreviewProxyHandler,
  publicPreviewProxyHandler,
} from "../controller/preview.controller.js"

const PROXY_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]

// Proxies live sandbox preview traffic through ForgeAI instead of exposing raw provider URLs.
export async function previewRouter(app: FastifyInstance): Promise<void> {
  app.route({
    method: PROXY_METHODS,
    url: "/project/:projectId/*",
    handler: privatePreviewProxyHandler,
  })
  app.route({
    method: PROXY_METHODS,
    url: "/public/:token/*",
    handler: publicPreviewProxyHandler,
  })
}
