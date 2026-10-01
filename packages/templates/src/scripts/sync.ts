// Publishes every template whose content hash changed: a per-version image built from its
// Dockerfile (checked against the image contract first), a versioned R2 zip and the
// Template/TemplateVersion rows. Published versions are never overwritten, and a version number
// used in any store is never reused.
//
// Run from packages/templates:
//   bun run templates:sync                  # every template
//   bun run templates:sync nextjs-starter   # just one
//   bun run templates:sync -- --force       # publish a new version even if nothing changed

import { resolve } from "node:path"

import {
  createR2Client,
  createSandboxProvider,
  type SandboxProviderName,
} from "@forgeAI/sandbox-provider"

import { templateImageName } from "@forgeAI/shared"

import { templateContentHash } from "../hash.js"
import { checkImageContract } from "../image-contract.js"
import { checkTemplatesFitPlan } from "../plan-check.js"
import { readTemplateDockerfile, storageRef, TEMPLATES } from "../registry.js"
import type { TemplateDefinition } from "../types.js"
import {
  bumpPatch,
  compareVersionsDesc,
  isVersion,
  nextVersion,
} from "../version.js"
import { zipFolder } from "../zip.js"

import { ENV_CONFIG } from "./envConfig.js"

const { prisma } = await import("@forgeAI/database")

const TEMPLATE_FOLDER = ENV_CONFIG.R2_TEMPLATE_FOLDER_NAME
// The provider images are built and checked on. Sandboxes opened here (the image check) are
// tagged "templates", so no orchestrator ever adopts them.
const provider = createSandboxProvider({
  provider: ENV_CONFIG.SANDBOX_PROVIDER as SandboxProviderName,
  apiKey: ENV_CONFIG.E2B_API_KEY,
  environment: "templates",
  maxLifetimeMinutes: null,
})

const r2 = createR2Client({
  accessKeyId: ENV_CONFIG.R2_ACCESS_KEY_ID,
  secretAccessKey: ENV_CONFIG.R2_SECRET_ACCESS_KEY,
  endpoint: ENV_CONFIG.R2_BUCKET_ENDPOINT,
  bucketName: ENV_CONFIG.R2_BUCKET_NAME,
})

// Returns the image name a template version boots from (stored as `imageRef`).
// One immutable image per version.
function imageRef(template: TemplateDefinition, version: string): string {
  return templateImageName(template.imageName, version)
}

// Returns the descriptive columns rewritten on every sync (not part of the hash).
// `runtime` is flattened to columns so `project.devCommand ?? template.devCommand` works.
function describe(template: TemplateDefinition) {
  const { description, tag, author, license, metadata, runtime } = template
  return {
    description,
    tag,
    author,
    license,
    metadata,
    devCommand: runtime.devCommand,
    devPort: runtime.port,
    installCommand: runtime.installCommand,
  }
}

// Collects every version published anywhere (DB, R2 zips, legacy E2B tags), newest first.
// Ensures a reset database can never cause a version number to be reused.
async function publishedVersions(
  template: TemplateDefinition,
): Promise<string[]> {
  const versions = new Set<string>()

  const rows = await prisma.templateVersion.findMany({
    where: { template: { name: template.name } },
    select: { version: true },
  })
  for (const row of rows) versions.add(row.version)

  for (const key of await r2.listObjects(
    `${TEMPLATE_FOLDER}/${template.name}/`,
  )) {
    const version = key.match(/\/(\d+\.\d+\.\d+)\.zip$/)?.[1]
    if (version) versions.add(version)
  }

  for (const tag of await provider.listImageTags(template.imageName)) {
    if (isVersion(tag)) versions.add(tag)
  }

  return [...versions].sort(compareVersionsDesc)
}

// Checks whether a version number is already used in any store.
// A taken number is never published again.
async function isTaken(
  template: TemplateDefinition,
  version: string,
  known: string[],
): Promise<boolean> {
  return (
    known.includes(version) ||
    (await provider.imageExists(imageRef(template, version)))
  )
}

// Finds a published version with exactly this content hash (zip + image both exist).
// Lets the sync re-record a version the database forgot instead of rebuilding it.
async function findPublishedWithHash(
  template: TemplateDefinition,
  contentHash: string,
  versions: string[],
) {
  for (const version of versions) {
    const zip = await r2.headObject(
      storageRef(TEMPLATE_FOLDER, template.name, version),
    )
    if (zip?.metadata.contenthash !== contentHash) continue
    if (await provider.imageExists(imageRef(template, version))) return version
  }
  return undefined
}

// Points the Template row at `version` and upserts the TemplateVersion row, including which
// provider built the image and the exact Dockerfile it came from (so it can be rebuilt elsewhere).
// The final step of publishing, also used to re-record a forgotten version (same hash, same Dockerfile).
async function record(
  template: TemplateDefinition,
  version: string,
  contentHash: string,
) {
  const key = storageRef(TEMPLATE_FOLDER, template.name, version)
  const image = {
    imageRef: imageRef(template, version),
    provider: provider.name,
  }
  const dockerfile = readTemplateDockerfile(template)
  const row = await prisma.template.upsert({
    where: { name: template.name },
    create: {
      ...describe(template),
      name: template.name,
      version,
      contentHash,
      storageRef: key,
      ...image,
      workspaceId: null,
    },
    update: {
      ...describe(template),
      version,
      contentHash,
      storageRef: key,
      ...image,
    },
  })
  await prisma.templateVersion.upsert({
    where: { templateId_version: { templateId: row.id, version } },
    create: {
      templateId: row.id,
      version,
      contentHash,
      storageRef: key,
      ...image,
      dockerfile,
    },
    update: { contentHash, storageRef: key, ...image, dockerfile },
  })
}

// Builds the version's image from its Dockerfile, checks it meets the image contract, uploads
// its zip to R2 and records it. Each image is built once, so a shipped version never changes.
async function publish(
  template: TemplateDefinition,
  version: string,
  contentHash: string,
) {
  const { resources } = template.metadata
  const image = imageRef(template, version)
  await provider.buildImage(image, {
    dockerfile: readTemplateDockerfile(template),
    contextDir: template.dir,
    resources,
  })
  console.log(
    `  built ${image} on ${provider.name} — ${resources.cpuCount} CPU, ${resources.memoryMB} MB memory, ${resources.diskMB} MB disk`,
  )

  // A broken image is never published: the version number stays used, so the next sync takes the next one.
  const problems = await checkImageContract(
    provider,
    image,
    ENV_CONFIG.R2_BUCKET_ENDPOINT,
  )
  if (problems.length) {
    throw new Error(
      `${template.name}@${version}: the image doesn't meet the image contract (docs/09 §5): ${problems.join("; ")}. Nothing was published; fix the Dockerfile and sync again.`,
    )
  }
  console.log(
    "  image contract: ok (tools, git, user, project folder, outbound HTTPS)",
  )

  const key = storageRef(TEMPLATE_FOLDER, template.name, version)
  const zip = zipFolder(resolve(template.dir, "code"))
  // The hash rides on the zip so a later sync can recognise this version.
  await r2.uploadObject(key, zip, "application/zip", {
    contenthash: contentHash,
  })
  console.log(`  uploaded source -> r2://${key} (${zip.byteLength} bytes)`)

  await record(template, version, contentHash)
  console.log(
    `  published ${template.name}@${version} — pods boot from ${imageRef(template, version)}`,
  )
}

// Picks an unused version number: the declared one if it's ahead, else the next free patch.
// Called only when a template actually needs publishing.
async function pickFreeVersion(
  template: TemplateDefinition,
  versions: string[],
): Promise<string> {
  let version = nextVersion(template.version, versions[0], template.name)
  while (await isTaken(template, version, versions))
    version = bumpPatch(version)
  return version
}

// Publishes one template if its content changed, or just refreshes its metadata.
// `force` publishes a new version even when nothing changed.
async function sync(template: TemplateDefinition, force: boolean) {
  const contentHash = await templateContentHash(template)
  const current = await prisma.template.findUnique({
    where: { name: template.name },
    select: { id: true, version: true, contentHash: true },
  })

  console.log(`\n${template.name} (${contentHash.slice(0, 12)})`)

  if (current && current.contentHash === contentHash && !force) {
    await prisma.template.update({
      where: { id: current.id },
      data: describe(template),
    })
    console.log(
      `  unchanged since ${current.version} — metadata refreshed, nothing built`,
    )
    return
  }

  const versions = await publishedVersions(template)

  if (!force) {
    const same = await findPublishedWithHash(template, contentHash, versions)
    if (same) {
      await record(template, same, contentHash)
      console.log(
        `  already published as ${same} — recorded it again, nothing built`,
      )
      return
    }
  }

  const version = await pickFreeVersion(template, versions)
  if (version !== template.version) {
    console.log(
      `  changed — publishing ${version} (template.ts declares ${template.version}, newest published ${versions[0] ?? "none"})`,
    )
  }

  await publish(template, version, contentHash)
}

// Parses CLI args and syncs the selected templates in order.
// Entry point for `bun run templates:sync`.
async function main() {
  const args = process.argv.slice(2)
  const force = args.includes("--force")
  const only = args.find((arg) => !arg.startsWith("--"))

  const targets = only ? TEMPLATES.filter((t) => t.name === only) : TEMPLATES
  if (targets.length === 0) throw new Error(`No template named "${only}"`)

  // Before building anything: a template the plan cannot run would only fail later, for a user.
  checkTemplatesFitPlan(targets)

  for (const template of targets) await sync(template, force)
  console.log("\ndone.")
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
