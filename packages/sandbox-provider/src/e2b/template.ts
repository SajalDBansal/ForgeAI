import { defaultBuildLogger, Template } from "e2b"

import type { BuildImageOpts } from "../provider.js"

// E2B's implementation of the image parts of SandboxProvider, used by templates:sync.

// Lists the tags published under an E2B image name.
// Returns an empty list when nothing has been built under that name yet.
export async function listImageTags(
  apiKey: string,
  name: string,
): Promise<string[]> {
  try {
    return (await Template.getTags(name, { apiKey })).map((tag) => tag.tag)
  } catch (error) {
    // E2B reports an unknown name as a TemplateError with status 404.
    if ((error as { statusCode?: number }).statusCode === 404) return []
    throw error
  }
}

// Checks whether E2B has an image with this name.
// Used by the template sync to skip versions that are already built.
export async function imageExists(
  apiKey: string,
  name: string,
): Promise<boolean> {
  return Template.exists(name, { apiKey })
}

// Builds an image from a Dockerfile and publishes it to E2B under \`name\`. E2B turns the
// Dockerfile into its own build steps (single stage; COPY paths are relative to \`contextDir\`),
// and caches layers, so an unchanged rebuild is cheap.
export async function buildImage(
  apiKey: string,
  name: string,
  { dockerfile, contextDir, resources }: BuildImageOpts,
): Promise<void> {
  const image = Template({ fileContextPath: contextDir }).fromDockerfile(
    dockerfile,
  )
  await Template.build(image, name, {
    apiKey,
    ...(resources && {
      cpuCount: resources.cpuCount,
      memoryMB: resources.memoryMB,
      minFreeDiskMb: resources.diskMB,
    }),
    onBuildLogs: defaultBuildLogger(),
  })
}
