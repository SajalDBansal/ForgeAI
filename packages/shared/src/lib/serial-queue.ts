// Runs work in order for each key while allowing different projects to work in parallel.
export function createSerialQueue() {
  const pending = new Map<string, Promise<unknown>>()

  function run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = pending.get(key) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(work)
    pending.set(key, next)
    void next
      .catch(() => undefined)
      .finally(() => {
        if (pending.get(key) === next) pending.delete(key)
      })
    return next
  }

  // Shutdown waits for accepted work before closing its connections.
  async function drain(): Promise<void> {
    while (pending.size > 0) await Promise.allSettled([...pending.values()])
  }

  return { run, drain }
}
