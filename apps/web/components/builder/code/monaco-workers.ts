// Starts Monaco's web workers from local entry files that Turbopack bundles properly.
// Without this, Monaco's own worker URLs 404 under Turbopack and every file open throws.
export function installMonacoWorkers(): void {
  globalThis.MonacoEnvironment = {
    getWorker(_workerId, label) {
      switch (label) {
        case "typescript":
        case "javascript":
          return new Worker(
            new URL("./workers/ts.worker.ts", import.meta.url),
            { type: "module", name: label },
          )
        case "json":
          return new Worker(
            new URL("./workers/json.worker.ts", import.meta.url),
            { type: "module", name: label },
          )
        case "css":
        case "scss":
        case "less":
          return new Worker(
            new URL("./workers/css.worker.ts", import.meta.url),
            { type: "module", name: label },
          )
        case "html":
        case "handlebars":
        case "razor":
          return new Worker(
            new URL("./workers/html.worker.ts", import.meta.url),
            { type: "module", name: label },
          )
        default:
          return new Worker(
            new URL("./workers/editor.worker.ts", import.meta.url),
            { type: "module", name: label },
          )
      }
    },
  }
}
