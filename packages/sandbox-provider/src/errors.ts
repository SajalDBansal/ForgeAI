/** A file bigger than the caller allows; `exact` is false when only a lower bound is known. */
export class FileTooLargeError extends Error {
  constructor(
    readonly path: string,
    readonly size: number,
    readonly maxBytes: number,
    readonly exact: boolean,
  ) {
    super(
      `${path} is ${exact ? "" : "more than "}${size} bytes, over the ${maxBytes}-byte limit`,
    )
    this.name = "FileTooLargeError"
  }
}

/**
 * The provider refused to create a sandbox because the account is full or creating too fast
 * (E2B's RateLimitError). Callers treat it as "busy, try again soon", never as a fault.
 */
export class ProviderCapacityError extends Error {
  constructor(cause?: unknown) {
    super("The sandbox provider has no room for another sandbox right now", {
      cause,
    })
    this.name = "ProviderCapacityError"
  }
}

/** A file that isn't there (deleted, or never existed). Every provider throws this, not its own (F5). */
export class FileNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`${path} does not exist`)
    this.name = "FileNotFoundError"
  }
}

/** A file that looks binary (a NUL byte near the start), so it can't be loaded as text. */
export class BinaryFileError extends Error {
  constructor(readonly path: string) {
    super(`${path} looks like a binary file`)
    this.name = "BinaryFileError"
  }
}
