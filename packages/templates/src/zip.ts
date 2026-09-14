import AdmZip from "adm-zip"

import { isTemplateFile } from "./code.js"

// Zips a template's `code/` folder, skipping excluded files.
// Produces the source bundle uploaded to R2 on publish.
export function zipFolder(folder: string): Buffer {
  const zip = new AdmZip()
  zip.addLocalFolder(folder, "", isTemplateFile)
  return zip.toBuffer()
}
