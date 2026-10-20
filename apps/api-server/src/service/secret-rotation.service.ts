import { prisma } from "@forgeAI/database"
import {
  reencryptConnectionSecret,
  reencryptProjectSecret,
  reencryptTeamMessage,
} from "../lib/encryption.js"

type SecretRotationKind = "connection" | "projectSecret" | "teamMessage"

export interface SecretRotationFailure {
  kind: SecretRotationKind
  id: string
  field?: "accessTokenEnc" | "refreshTokenEnc" | "valueEnc" | "contentEnc"
  error: "decrypt_failed"
}

export interface SecretRotationReport {
  scanned: number
  rotated: number
  failures: SecretRotationFailure[]
}

export interface SecretRotationOptions {
  /** Number of rows to fetch per database page. */
  limit?: number
}

const DEFAULT_LIMIT = 500

export async function rotateEncryptedSecrets(
  options: SecretRotationOptions = {},
): Promise<SecretRotationReport> {
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT)
  const report: SecretRotationReport = { scanned: 0, rotated: 0, failures: [] }

  await rotateConnections(limit, report)
  await rotateProjectSecrets(limit, report)
  await rotateTeamMessages(limit, report)

  return report
}

async function rotateConnections(limit: number, report: SecretRotationReport) {
  let cursor: string | undefined

  while (true) {
    const rows = await prisma.connection.findMany({
      where: {
        OR: [
          { accessTokenEnc: { not: null } },
          { refreshTokenEnc: { not: null } },
        ],
      },
      select: { id: true, accessTokenEnc: true, refreshTokenEnc: true },
      orderBy: { id: "asc" },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (rows.length === 0) break

    report.scanned += rows.length
    cursor = rows[rows.length - 1]?.id

    for (const row of rows) {
      const data: { accessTokenEnc?: string; refreshTokenEnc?: string | null } =
        {}
      let changed = false

      if (row.accessTokenEnc) {
        const rotated = tryRotate(
          report,
          "connection",
          row.id,
          "accessTokenEnc",
          row.accessTokenEnc,
          reencryptConnectionSecret,
        )
        if (!rotated.ok) continue
        if (rotated.result.rotated) {
          data.accessTokenEnc = rotated.result.value
          changed = true
        }
      }

      if (row.refreshTokenEnc) {
        const rotated = tryRotate(
          report,
          "connection",
          row.id,
          "refreshTokenEnc",
          row.refreshTokenEnc,
          reencryptConnectionSecret,
        )
        if (!rotated.ok) continue
        if (rotated.result.rotated) {
          data.refreshTokenEnc = rotated.result.value
          changed = true
        }
      }

      if (changed) {
        await prisma.connection.update({ where: { id: row.id }, data })
        report.rotated += 1
      }
    }
  }
}

async function rotateProjectSecrets(
  limit: number,
  report: SecretRotationReport,
) {
  let cursor: string | undefined

  while (true) {
    const rows = await prisma.projectSecret.findMany({
      select: { id: true, valueEnc: true },
      orderBy: { id: "asc" },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (rows.length === 0) break

    report.scanned += rows.length
    cursor = rows[rows.length - 1]?.id

    for (const row of rows) {
      const rotated = tryRotate(
        report,
        "projectSecret",
        row.id,
        "valueEnc",
        row.valueEnc,
        reencryptProjectSecret,
      )
      if (!rotated.ok || !rotated.result.rotated) continue
      await prisma.projectSecret.update({
        where: { id: row.id },
        data: { valueEnc: rotated.result.value },
      })
      report.rotated += 1
    }
  }
}

async function rotateTeamMessages(limit: number, report: SecretRotationReport) {
  let cursor: string | undefined

  while (true) {
    const rows = await prisma.teamMessage.findMany({
      select: { id: true, contentEnc: true },
      orderBy: { id: "asc" },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (rows.length === 0) break

    report.scanned += rows.length
    cursor = rows[rows.length - 1]?.id

    for (const row of rows) {
      const rotated = tryRotate(
        report,
        "teamMessage",
        row.id,
        "contentEnc",
        row.contentEnc,
        reencryptTeamMessage,
      )
      if (!rotated.ok || !rotated.result.rotated) continue
      await prisma.teamMessage.update({
        where: { id: row.id },
        data: { contentEnc: rotated.result.value },
      })
      report.rotated += 1
    }
  }
}

function tryRotate(
  report: SecretRotationReport,
  kind: SecretRotationKind,
  id: string,
  field: SecretRotationFailure["field"],
  value: string,
  rotate: (value: string) => { value: string; rotated: boolean },
): { ok: true; result: { value: string; rotated: boolean } } | { ok: false } {
  try {
    return { ok: true, result: rotate(value) }
  } catch {
    report.failures.push({ kind, id, field, error: "decrypt_failed" })
    return { ok: false }
  }
}
