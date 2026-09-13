import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export interface R2Config {
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  bucketName: string
}

export interface R2Client {
  /** `metadata` travels with the object and comes back on `headObject`. */
  uploadObject(
    key: string,
    body: Uint8Array,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<void>
  downloadObject(key: string): Promise<Buffer>
  /** A short-lived URL the browser downloads `key` from directly, saved as `filename`. */
  signDownloadUrl(
    key: string,
    filename: string,
    expiresInSeconds: number,
  ): Promise<string>
  /** A short-lived PUT URL for one key; keeps R2 credentials out of the sandbox. Never scope to a prefix. */
  signUploadUrl(key: string, expiresInSeconds: number): Promise<string>
  /** Size and metadata, or undefined when the object is missing. */
  /** `etag` is the object's version: a new upload gets a new one (the knowledge graph's "changed?" check, Q5). */
  headObject(
    key: string,
  ): Promise<
    | { size: number; metadata: Record<string, string>; etag?: string }
    | undefined
  >
  /** Server-side copy; how a staged upload is promoted and gets its metadata attached. */
  copyObject(
    fromKey: string,
    toKey: string,
    metadata?: Record<string, string>,
  ): Promise<void>
  deleteObject(key: string): Promise<void>
  listObjects(prefix?: string): Promise<string[]>
}

// Strips any path (often a pasted bucket name) from the R2 endpoint.
// Prevents keys being doubled up as "<bucket>/<bucket>/..." with path-style addressing.
function toOrigin(endpoint: string): string {
  return new URL(endpoint).origin
}

// Creates a thin S3-compatible client for Cloudflare R2.
// Used for template bundles and per-project snapshot storage.
export function createR2Client(config: R2Config): R2Client {
  const client = new S3Client({
    region: "auto",
    endpoint: toOrigin(config.endpoint),
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })

  return {
    async uploadObject(key, body, contentType, metadata) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: key,
          Body: body,
          ContentType: contentType,
          ...(metadata && { Metadata: metadata }),
        }),
      )
    },
    async downloadObject(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
      )
      const bytes = await result.Body?.transformToByteArray()
      if (!bytes) {
        throw new Error(`R2 object not found or empty: ${key}`)
      }
      return Buffer.from(bytes)
    },
    async signDownloadUrl(key, filename, expiresInSeconds) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.bucketName,
          Key: key,
          // Download under a readable name instead of navigating to the object.
          ResponseContentDisposition: `attachment; filename="${filename}"`,
        }),
        { expiresIn: expiresInSeconds },
      )
    },
    async signUploadUrl(key, expiresInSeconds) {
      return getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: config.bucketName, Key: key }),
        {
          expiresIn: expiresInSeconds,
        },
      )
    },
    async headObject(key) {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: config.bucketName, Key: key }),
        )
        return {
          size: result.ContentLength ?? 0,
          metadata: result.Metadata ?? {},
          // S3 and R2 send the ETag in quotes.
          ...(result.ETag && { etag: result.ETag.replaceAll('"', "") }),
        }
      } catch (error) {
        // A missing object is an answer, not a failure.
        const name = (error as { name?: string }).name
        if (name === "NotFound" || name === "NoSuchKey") return undefined
        throw error
      }
    },
    async copyObject(fromKey, toKey, metadata) {
      await client.send(
        new CopyObjectCommand({
          Bucket: config.bucketName,
          CopySource: `${config.bucketName}/${fromKey}`,
          Key: toKey,
          ...(metadata && { Metadata: metadata, MetadataDirective: "REPLACE" }),
        }),
      )
    },
    async deleteObject(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }),
      )
    },
    async listObjects(prefix) {
      const result = await client.send(
        new ListObjectsV2Command({ Bucket: config.bucketName, Prefix: prefix }),
      )
      return (result.Contents ?? []).map((obj) => obj.Key!).filter(Boolean)
    },
  }
}
