import { apiRequest, type ApiResult } from "@/lib/api-client"
import type { TemplateDownload } from "@/lib/types"

// Asks the API for a short-lived download link to a template's source zip.
// The browser then downloads it straight from R2.
export function templateDownloadRequest(
  templateId: string,
): Promise<ApiResult<TemplateDownload>> {
  return apiRequest<TemplateDownload>(
    `/template/${encodeURIComponent(templateId)}/download`,
    {
      method: "GET",
      fallbackError: "Couldn't prepare that download.",
    },
  )
}
