import { createR2Client } from "@forgeAI/sandbox-provider"
import { ENV_CONFIG } from "./envConfig.js"

// The API's R2 client: presigned URLs and server-side copies, so no file bytes pass through here.
export const r2 = createR2Client({
  accessKeyId: ENV_CONFIG.R2_ACCESS_KEY_ID,
  secretAccessKey: ENV_CONFIG.R2_SECRET_ACCESS_KEY,
  endpoint: ENV_CONFIG.R2_BUCKET_ENDPOINT,
  bucketName: ENV_CONFIG.R2_BUCKET_NAME,
})
