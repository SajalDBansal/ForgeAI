export interface SecretRedaction {
  key: string
  value: string
}

// Redact longer values first so overlapping secrets cannot leave a visible suffix.
export function createSecretTextRedactor(secrets: SecretRedaction[]) {
  const values = secrets
    .filter((secret) => secret.value.length > 0)
    .sort((a, b) => b.value.length - a.value.length)
  return (text: string): string => {
    for (const secret of values)
      text = text.split(secret.value).join(`[redacted:${secret.key}]`)
    return text.replace(
      /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASS|API_KEY|ACCESS_KEY|PRIVATE_KEY|AUTH)[A-Z0-9_]*)\s*[:=]\s*([^\s"'`,;]+)/gi,
      "$1=[redacted]",
    )
  }
}

// Hold a trailing fragment until the next chunk can prove it is not part of a secret.
export function createSecretStreamRedactor(secrets: SecretRedaction[]) {
  const values = secrets.map((secret) => secret.value).filter(Boolean)
  const redact = createSecretTextRedactor(secrets)
  const lookahead = Math.max(0, ...values.map((value) => value.length - 1))
  let pending = ""

  function push(chunk: string): string {
    pending += chunk
    let cut = Math.max(0, pending.length - lookahead)
    for (const value of values) {
      let at = pending.indexOf(value)
      while (at >= 0 && at < cut) {
        if (at + value.length > cut) cut = at
        at = pending.indexOf(value, at + 1)
      }
    }
    const safe = redact(pending.slice(0, cut))
    pending = pending.slice(cut)
    return safe
  }

  function flush(): string {
    const safe = redact(pending)
    pending = ""
    return safe
  }

  return { push, flush }
}
