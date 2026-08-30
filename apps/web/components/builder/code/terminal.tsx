"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp, Terminal as TerminalIcon } from "lucide-react"

import { INITIAL_TERM_LINES, STREAM_LINES, type TermLine } from "@/lib/builder-data"

export function Terminal() {
  const [open, setOpen] = useState(true)
  const [input, setInput] = useState("")
  const [lines, setLines] = useState<TermLine[]>(INITIAL_TERM_LINES)
  const [streaming, setStreaming] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idxRef = useRef(0)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines, open])

  useEffect(() => {
    if (!streaming || !open || STREAM_LINES.length === 0) return
    const id = setInterval(() => {
      const next = STREAM_LINES[idxRef.current % STREAM_LINES.length]!
      idxRef.current += 1
      setLines((prev) => (prev.length > 400 ? [...prev.slice(-300), next] : [...prev, next]))
    }, 2200)
    return () => clearInterval(id)
  }, [streaming, open])

  const run = (raw: string) => {
    const cmd = raw.trim()
    if (!cmd) return
    const out: TermLine[] = [{ t: "cmd", v: `$ ${cmd}` }]
    if (cmd === "clear") {
      setLines([])
      setInput("")
      return
    }
    if (cmd === "help") out.push({ t: "info", v: "commands: help · clear · ls · ps · build · deploy · env · whoami · pause · resume" })
    else if (cmd === "ls") out.push({ t: "info", v: "src/  package.json  tsconfig.json  vite.config.ts  README.md" })
    else if (cmd === "ps") {
      out.push({ t: "info", v: "PID   CMD" })
      out.push({ t: "info", v: "1284  node vite dev" })
      out.push({ t: "info", v: "1301  forge-agent --watch" })
    } else if (cmd === "build") {
      out.push({ t: "info", v: "vite build …" })
      out.push({ t: "ok", v: "✔ built in 1.9s · 218 kB gzipped" })
    } else if (cmd === "deploy") out.push({ t: "info", v: "use the Deploy button in the header" })
    else if (cmd === "env") out.push({ t: "info", v: "use the Cloud tab to manage secrets" })
    else if (cmd === "whoami") out.push({ t: "info", v: "forge-agent · session-local" })
    else if (cmd === "pause") {
      setStreaming(false)
      out.push({ t: "info", v: "stream paused" })
    } else if (cmd === "resume") {
      setStreaming(true)
      out.push({ t: "info", v: "stream resumed" })
    } else out.push({ t: "err", v: `forge: command not found: ${cmd}` })
    setLines((prev) => [...prev, ...out])
    setInput("")
  }

  return (
    <div className="border-t border-hairline-strong/30 bg-surface-dark text-on-dark-surface shrink-0">
      <div className="px-3 py-1 flex items-center gap-2 text-[11px] text-ash-dark-surface border-b border-hairline-strong/30">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 hover:text-on-dark-surface">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          <TerminalIcon className="h-3 w-3" /> Terminal
        </button>
        <span className="text-ash-dark-surface/60">·</span>
        <span>bash · vm-forge-01</span>
        <span className="text-ash-dark-surface/60">·</span>
        <span className={streaming ? "text-[#c3e88d]" : "text-ash-dark-surface/60"}>{streaming ? "● live" : "○ paused"}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setStreaming((s) => !s)} className="px-1.5 hover:text-on-dark-surface">
            {streaming ? "pause" : "resume"}
          </button>
          <button onClick={() => setLines(INITIAL_TERM_LINES)} className="px-1.5 hover:text-on-dark-surface">
            reset
          </button>
          <button onClick={() => setLines([])} className="px-1.5 hover:text-on-dark-surface">
            clear
          </button>
        </div>
      </div>
      {open && (
        <>
          <div ref={scrollRef} className="h-40 overflow-y-auto dark-scroll px-3 py-2 font-mono text-[12px] leading-[1.55]">
            {lines.map((l, i) => (
              <div
                key={i}
                className={
                  l.t === "cmd" ? "text-on-dark-surface" : l.t === "ok" ? "text-[#c3e88d]" : l.t === "err" ? "text-[#ff6b6b]" : "text-ash-dark-surface"
                }
              >
                {l.v}
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              run(input)
            }}
            className="border-t border-hairline-strong/30 px-3 py-1.5 flex items-center gap-2 font-mono text-[12px]"
          >
            <span className="text-[#82aaff]">forge@builder</span>
            <span className="text-ash-dark-surface">:~$</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="type 'help' and press ↵"
              className="flex-1 bg-transparent focus:outline-none text-on-dark-surface placeholder:text-ash-dark-surface/60"
            />
          </form>
        </>
      )}
    </div>
  )
}
