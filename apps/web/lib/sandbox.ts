import { apiRequest, type ApiResult } from "@/lib/api-client"
import type {
  DevCommandSettings,
  EnsurePodResponse,
  PodFileListing,
  PreviewLinkStatus,
} from "@/lib/types"

// Opens the project's sandbox or reattaches to it; the API picks the image.
// Can be slow on a cold start, so callers show a waiting state.
export function ensurePodRequest(
  projectId: string,
): Promise<ApiResult<EnsurePodResponse>> {
  return apiRequest<EnsurePodResponse>(
    `/project/${encodeURIComponent(projectId)}/sandbox`,
    {
      method: "POST",
      fallbackError: "Couldn't start the sandbox. Try again.",
    },
  )
}

// ---------- THE RUN COMMAND ----------
// Saving the command is HTTP; running it goes over the socket.

// Loads the dev command settings for the Start dialog.
// Read fresh each time so collaborators' changes are visible.
export function getDevCommandRequest(
  projectId: string,
): Promise<ApiResult<DevCommandSettings>> {
  return apiRequest<DevCommandSettings>(
    `/project/${encodeURIComponent(projectId)}/sandbox/dev-command`,
    {
      method: "GET",
      fallbackError: "Couldn't load the run command.",
    },
  )
}

// Saves a project-wide dev command and port.
// Submitting the current command unchanged is a no-op on the server.
export function setDevCommandRequest(
  projectId: string,
  input: { command: string; port: number },
): Promise<ApiResult<DevCommandSettings>> {
  return apiRequest<DevCommandSettings>(
    `/project/${encodeURIComponent(projectId)}/sandbox/dev-command`,
    {
      method: "PUT",
      body: JSON.stringify(input),
      fallbackError: "Couldn't save the run command.",
    },
  )
}

// Resets the dev command to the template default.
// Backs "Reset to template default" in the Start dialog.
export function resetDevCommandRequest(
  projectId: string,
): Promise<ApiResult<DevCommandSettings>> {
  return apiRequest<DevCommandSettings>(
    `/project/${encodeURIComponent(projectId)}/sandbox/dev-command`,
    {
      method: "DELETE",
      fallbackError: "Couldn't reset the run command.",
    },
  )
}

// ---------- PREVIEW LINKS ----------

export function getPreviewLinkStatusRequest(
  projectId: string,
): Promise<ApiResult<PreviewLinkStatus>> {
  return apiRequest<PreviewLinkStatus>(
    `/project/${encodeURIComponent(projectId)}/preview-link`,
    {
      method: "GET",
      fallbackError: "Couldn't load preview sharing.",
    },
  )
}

export function createGlobalPreviewLinkRequest(
  projectId: string,
): Promise<ApiResult<PreviewLinkStatus>> {
  return apiRequest<PreviewLinkStatus>(
    `/project/${encodeURIComponent(projectId)}/preview-link`,
    {
      method: "POST",
      fallbackError: "Couldn't create the global preview link.",
    },
  )
}

export function stopGlobalPreviewLinkRequest(
  projectId: string,
): Promise<ApiResult<PreviewLinkStatus>> {
  return apiRequest<PreviewLinkStatus>(
    `/project/${encodeURIComponent(projectId)}/preview-link`,
    {
      method: "DELETE",
      fallbackError: "Couldn't stop the global preview link.",
    },
  )
}

// ---------- FILES ----------

// Lists a project folder (root when `path` is omitted), prefetching `depth` levels.
// Ignored folders like node_modules come back as one closed `hidden` entry; huge folders are capped.
export function listProjectFilesRequest(
  projectId: string,
  options: { path?: string; depth?: number } = {},
): Promise<ApiResult<PodFileListing>> {
  const query = new URLSearchParams()
  if (options.path) query.set("path", options.path)
  if (options.depth) query.set("depth", String(options.depth))

  const suffix = query.toString() ? `?${query.toString()}` : ""
  return apiRequest<PodFileListing>(
    `/project/${encodeURIComponent(projectId)}/sandbox/fs/list${suffix}`,
    {
      method: "GET",
      fallbackError: "Couldn't load this folder.",
    },
  )
}

// Reads one file from the sandbox.
// Used for files not opened as shared documents.
export function readProjectFileRequest(
  projectId: string,
  path: string,
): Promise<ApiResult<{ content: string }>> {
  const query = new URLSearchParams({ path }).toString()
  return apiRequest<{ content: string }>(
    `/project/${encodeURIComponent(projectId)}/sandbox/fs?${query}`,
    {
      method: "GET",
      fallbackError: "Couldn't open this file.",
    },
  )
}

// Writes one file to the sandbox.
// Files open in a shared document are saved by the orchestrator instead.
export function writeProjectFileRequest(
  projectId: string,
  path: string,
  content: string,
): Promise<ApiResult<void>> {
  return apiRequest<void>(
    `/project/${encodeURIComponent(projectId)}/sandbox/fs`,
    {
      method: "PUT",
      body: JSON.stringify({ path, content }),
      fallbackError: "Couldn't save this file.",
    },
  )
}
