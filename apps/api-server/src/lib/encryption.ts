import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto"
import { ENV_CONFIG } from "./envConfig.js"

const ALGORITHM = "aes-256-gcm"
const ENVELOPE_PREFIX = "enc:v1:"
const LEGACY_PROJECT_SECRET_PREFIX = "v2:"
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

type SecretScope = "connection" | "team-chat" | "project-secrets"

interface RawKey {
  id: string
  secret: string
}

interface CodecConfig {
  scope: SecretScope
  active: RawKey
  previous: RawKey[]
}

interface EncryptedEnvelope {
  keyId: string
  sealed: string
}

interface DerivedKey {
  id: string
  key: Buffer
}

export interface ReencryptedSecret {
  value: string
  rotated: boolean
}

interface SecretCodec {
  encrypt(plainText: string): string
  decrypt(payload: string): string
  reencrypt(payload: string): ReencryptedSecret
}

const connectionCodec = createSecretCodec({
  scope: "connection",
  active: {
    id: ENV_CONFIG.CONNECTION_ENCRYPTION_KEY_ID,
    secret: ENV_CONFIG.CONNECTION_ENCRYPTION_KEY,
  },
  previous: parsePreviousKeys(
    "CONNECTION_PREVIOUS_ENCRYPTION_KEYS",
    ENV_CONFIG.CONNECTION_PREVIOUS_ENCRYPTION_KEYS,
  ),
})

const teamChatCodec = createSecretCodec({
  scope: "team-chat",
  active: {
    id: ENV_CONFIG.TEAM_CHAT_ENCRYPTION_KEY_ID,
    secret: ENV_CONFIG.TEAM_CHAT_ENCRYPTION_KEY,
  },
  previous: parsePreviousKeys(
    "TEAM_CHAT_PREVIOUS_ENCRYPTION_KEYS",
    ENV_CONFIG.TEAM_CHAT_PREVIOUS_ENCRYPTION_KEYS,
  ),
})

const projectSecretsCodec = createSecretCodec({
  scope: "project-secrets",
  active: {
    id: ENV_CONFIG.PROJECT_SECRETS_ENCRYPTION_KEY_ID,
    secret: ENV_CONFIG.PROJECT_SECRETS_ENCRYPTION_KEY,
  },
  previous: parsePreviousKeys(
    "PROJECT_SECRETS_PREVIOUS_ENCRYPTION_KEYS",
    ENV_CONFIG.PROJECT_SECRETS_PREVIOUS_ENCRYPTION_KEYS,
  ),
})

// Encrypts a connection secret (e.g. an OAuth token) for storage.
// Used for provider tokens in the Connection table.
export function encrypt(plainText: string): string {
  return connectionCodec.encrypt(plainText)
}

// Decrypts a stored connection secret.
// Used when calling a provider API on the user's behalf.
export function decrypt(payload: string): string {
  return connectionCodec.decrypt(payload)
}

// Encrypts a Team chat message for storage.
// Uses its own key, separate from connection secrets.
export function encryptTeamMessage(plainText: string): string {
  return teamChatCodec.encrypt(plainText)
}

// Decrypts a stored Team chat message.
// Used when listing or broadcasting messages.
export function decryptTeamMessage(payload: string): string {
  return teamChatCodec.decrypt(payload)
}

// Encrypts a project secret for storage.
// Uses its own key, separate from connection secrets and Team chat.
export function encryptProjectSecret(plainText: string): string {
  return projectSecretsCodec.encrypt(plainText)
}

// Decrypts a stored project secret. Backs the "reveal" button.
// Supports legacy `v2:` project-secret rows and older unprefixed rows.
export function decryptProjectSecret(payload: string): string {
  return openProjectSecret(payload)
}

export function reencryptConnectionSecret(payload: string): ReencryptedSecret {
  return connectionCodec.reencrypt(payload)
}

export function reencryptTeamMessage(payload: string): ReencryptedSecret {
  return teamChatCodec.reencrypt(payload)
}

export function reencryptProjectSecret(payload: string): ReencryptedSecret {
  const alreadyCurrent =
    parseEnvelope(payload)?.keyId ===
    validateKeyId(
      "PROJECT_SECRETS_ENCRYPTION_KEY_ID",
      ENV_CONFIG.PROJECT_SECRETS_ENCRYPTION_KEY_ID,
    )
  if (alreadyCurrent) return { value: payload, rotated: false }
  return {
    value: projectSecretsCodec.encrypt(openProjectSecret(payload)),
    rotated: true,
  }
}

export function isVersionedEncryptedPayload(payload: string): boolean {
  return payload.startsWith(ENVELOPE_PREFIX)
}

// Exported for focused tests and future operational checks; production uses the configured codecs.
export function createSecretCodec(config: CodecConfig): SecretCodec {
  const activeId = validateKeyId(`${config.scope} active key`, config.active.id)
  const active = deriveKey(config.scope, { ...config.active, id: activeId })
  const previous = config.previous.map((raw) =>
    deriveKey(config.scope, {
      ...raw,
      id: validateKeyId(`${config.scope} previous key`, raw.id),
    }),
  )
  const byId = new Map<string, DerivedKey>([
    [active.id, active],
    ...previous.map((key): [string, DerivedKey] => [key.id, key]),
  ])
  if (byId.size !== previous.length + 1) {
    throw new Error(`${config.scope} encryption key ids must be unique`)
  }

  function encrypt(plainText: string): string {
    return `${ENVELOPE_PREFIX}${active.id}:${seal(active.key, plainText)}`
  }

  function decrypt(payload: string): string {
    const envelope = parseEnvelope(payload)
    if (envelope) {
      const key = byId.get(envelope.keyId)
      if (!key) throw new Error("Encrypted payload uses an unknown key id")
      return open(key.key, envelope.sealed)
    }
    return openWithAnyKey([active, ...previous], payload)
  }

  function reencrypt(payload: string): ReencryptedSecret {
    if (parseEnvelope(payload)?.keyId === active.id)
      return { value: payload, rotated: false }
    return { value: encrypt(decrypt(payload)), rotated: true }
  }

  return { encrypt, decrypt, reencrypt }
}

function openProjectSecret(payload: string): string {
  if (payload.startsWith(LEGACY_PROJECT_SECRET_PREFIX)) {
    return openWithAnyKey(
      projectSecretsKeyCandidates(),
      payload.slice(LEGACY_PROJECT_SECRET_PREFIX.length),
    )
  }
  if (isVersionedEncryptedPayload(payload))
    return projectSecretsCodec.decrypt(payload)
  // Before project secrets had their own key, these rows used the connection key.
  return connectionCodec.decrypt(payload)
}

function projectSecretsKeyCandidates(): DerivedKey[] {
  return [
    deriveKey("project-secrets", {
      id: ENV_CONFIG.PROJECT_SECRETS_ENCRYPTION_KEY_ID,
      secret: ENV_CONFIG.PROJECT_SECRETS_ENCRYPTION_KEY,
    }),
    ...parsePreviousKeys(
      "PROJECT_SECRETS_PREVIOUS_ENCRYPTION_KEYS",
      ENV_CONFIG.PROJECT_SECRETS_PREVIOUS_ENCRYPTION_KEYS,
    ).map((raw) => deriveKey("project-secrets", raw)),
  ]
}

function parseEnvelope(payload: string): EncryptedEnvelope | null {
  if (!payload.startsWith(ENVELOPE_PREFIX)) return null
  const rest = payload.slice(ENVELOPE_PREFIX.length)
  const separator = rest.indexOf(":")
  if (separator < 1) throw new Error("Invalid encrypted payload")
  const keyId = rest.slice(0, separator)
  validateKeyId("encrypted payload key id", keyId)
  return { keyId, sealed: rest.slice(separator + 1) }
}

function parsePreviousKeys(name: string, raw: string): RawKey[] {
  if (!raw.trim()) return []
  return raw.split(",").map((entry) => {
    const separator = entry.indexOf("=")
    if (separator < 1 || separator === entry.length - 1)
      throw new Error(`${name} entries must be keyId=secret`)
    const id = validateKeyId(name, entry.slice(0, separator).trim())
    const secret = entry.slice(separator + 1).trim()
    if (!secret) throw new Error(`${name} entries must include a secret`)
    return { id, secret }
  })
}

function validateKeyId(name: string, id: string): string {
  if (!KEY_ID_PATTERN.test(id)) {
    throw new Error(
      `${name} must be 1-64 characters using letters, numbers, dot, underscore or dash`,
    )
  }
  return id
}

function deriveKey(scope: SecretScope, raw: RawKey): DerivedKey {
  return {
    id: validateKeyId(`${scope} key`, raw.id),
    key: scryptSync(raw.secret, `forge-ai-${scope}`, 32),
  }
}

function openWithAnyKey(keys: DerivedKey[], payload: string): string {
  let lastError: unknown
  for (const candidate of keys) {
    try {
      return open(candidate.key, payload)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Invalid encrypted payload")
}

// AES-256-GCM encrypts text as "iv.authTag.data" in base64.
function seal(key: Buffer, plainText: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [iv, authTag, encrypted]
    .map((part) => part.toString("base64"))
    .join(".")
}

// Decrypts a "iv.authTag.data" payload made by seal.
// Throws if the payload is malformed, made with another key or tampered with.
function open(key: Buffer, payload: string): string {
  const [ivB64, authTagB64, dataB64] = payload.split(".")
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload")
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64"),
  )
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"))

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8")
}
