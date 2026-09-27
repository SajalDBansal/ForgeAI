import { createR2Client } from "@forgeAI/sandbox-provider"

import { ENV_CONFIG } from "../envConfig.js"

// The orchestrator's R2 client. It signs URLs and moves keys but never carries file bytes:
// sandboxes upload through presigned URLs and promotion is a server-side copy.
export const r2 = createR2Client({
  accessKeyId: ENV_CONFIG.R2_ACCESS_KEY_ID,
  secretAccessKey: ENV_CONFIG.R2_SECRET_ACCESS_KEY,
  endpoint: ENV_CONFIG.R2_BUCKET_ENDPOINT,
  bucketName: ENV_CONFIG.R2_BUCKET_NAME,
})
