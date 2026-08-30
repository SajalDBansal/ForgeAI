const KEYWORDS = /^(import|from|export|default|return|function|const|let|var|if|else|new)$/

export function highlight(line: string) {
  const tokens = line.split(
    /(\b(?:import|from|export|default|return|function|const|let|var|if|else|new)\b|".*?"|'.*?'|`.*?`|\{|\}|<|>|\/\/.*$)/g
  )
  return tokens.map((t, i) => {
    if (!t) return null
    if (KEYWORDS.test(t)) return <span key={i} className="text-[#82aaff]">{t}</span>
    if (/^["'`].*["'`]$/.test(t)) return <span key={i} className="text-[#c3e88d]">{t}</span>
    if (/^\/\//.test(t)) return <span key={i} className="text-ash-dark-surface italic">{t}</span>
    if (/^[<>{}]$/.test(t)) return <span key={i} className="text-[#f78c6c]">{t}</span>
    return <span key={i} className="text-on-dark-surface">{t}</span>
  })
}
