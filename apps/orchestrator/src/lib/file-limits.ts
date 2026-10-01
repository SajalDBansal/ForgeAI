import {
  BinaryFileError,
  FileTooLargeError,
  type ReadFileFromPodOpts,
} from "@forgeAI/sandbox-provider"

import { ENV_CONFIG } from "../envConfig.js"

/** Read options for anything that loads a file into the editor or a shared document. */
export const EDITOR_READ: ReadFileFromPodOpts = {
  maxBytes: ENV_CONFIG.EDITOR_MAX_FILE_BYTES,
  rejectBinary: true,
}

// Formats a byte count the way people read file sizes.
function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Explains a refused read (too large, or binary) in words a person can act on; undefined for any other error.
// Shared by the document service and the file endpoint so both say the same thing.
export function editorReadRefusal(error: unknown): string | undefined {
  if (error instanceof BinaryFileError) {
    return "This looks like a binary file (an image, archive or compiled file), so it can't be edited here."
  }
  if (!(error instanceof FileTooLargeError)) return undefined
  const size = error.exact
    ? `${megabytes(error.size)}; the limit is ${megabytes(error.maxBytes)}`
    : `more than ${megabytes(error.maxBytes)}`
  return `This file is too large to open in the editor (${size}). Use the terminal to look at it.`
}
