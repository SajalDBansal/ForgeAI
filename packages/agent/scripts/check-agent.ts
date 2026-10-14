// Checks that the configured provider and models work through runAgent() (work plan I4).
// Uses the nextjs-starter template's code as "the project", with two read-only file tools.
// Run from packages/agent: bun run check   (reads packages/agent/.env; about 10 model requests)
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import type { AgentEvent } from "@forgeAI/shared"

import {
  agentConfigFromEnv,
  buildContext,
  compactFileTree,
  CONTEXT_BUDGETS,
  MIN_RECENT_EXCHANGES,
  runAgent,
  summarizeHistory,
  Type,
  type ContextChatMessage,
  type ForgeTool,
} from "../src/index.js"

const PROJECT = join(
  import.meta.dirname,
  "../../templates/templates/nextjs-starter/code",
)
const config = agentConfigFromEnv(process.env)

let failures = 0
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`)
}

// Every file under the project, relative, skipping node_modules.
function listFiles(dir = PROJECT): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === "node_modules") return []
    return statSync(path).isDirectory()
      ? listFiles(path)
      : [relative(PROJECT, path).replaceAll("\\", "/")]
  })
}

const tools: ForgeTool[] = [
  {
    name: "list_files",
    label: "Listing files",
    description: "List every file in the project, one path per line.",
    parameters: Type.Object({}),
    execute: async () => ({
      content: [{ type: "text", text: listFiles().join("\n") }],
      details: undefined,
    }),
  },
  {
    name: "read_file",
    label: "Reading a file",
    description: "Read one file of the project.",
    parameters: Type.Object({
      path: Type.String({
        description: "Path relative to the project root, e.g. package.json",
      }),
    }),
    summarize: (args) => `Reading ${String(args.path)}`,
    execute: async (_id, params) => {
      const path = join(PROJECT, (params as { path: string }).path)
      if (!path.startsWith(PROJECT))
        throw new Error("Path is outside the project")
      return {
        content: [{ type: "text", text: readFileSync(path, "utf8") }],
        details: undefined,
      }
    },
  },
]

const system = `You are ForgeAI's coding agent, working on a user's web project. Be brief.
Project: a Next.js starter (template nextjs-starter). Files:
${listFiles().join("\n")}`

// Collects a run's live events by type.
function recorder() {
  const events: AgentEvent[] = []
  return {
    events,
    onEvent: (e: AgentEvent) => events.push(e),
    count: (type: AgentEvent["type"]) =>
      events.filter((e) => e.type === type).length,
  }
}

async function main() {
  console.log(
    `provider ${config.provider} · code ${config.modelCode} · fast ${config.modelFast} · thinking ${config.thinking}\n`,
  )

  // 1. A streamed answer about the project, no tools.
  const one = recorder()
  const first = await runAgent({
    config,
    runId: "check-1",
    system,
    prompt: "In one sentence: what kind of project is this?",
    onEvent: one.onEvent,
  }).done
  check(
    "1. streamed reply",
    first.stopReason === "stop" &&
      one.count("text.delta") > 1 &&
      first.replies.length === 1,
    `${one.count("text.delta")} pieces, stop=${first.stopReason}${first.error ? `, ${first.error}` : ""}`,
  )
  check(
    "   reply text matches the pieces",
    first.replies[0]?.text ===
      one.events
        .flatMap((e) => (e.type === "text.delta" ? [e.text] : []))
        .join(""),
  )
  check(
    "   usage counted",
    first.tokensIn > 0 &&
      first.tokensOut > 0 &&
      one.count("run.usage") === first.calls.length,
    `${first.tokensIn} in, ${first.tokensOut} out, $${(first.costMicros / 1e6).toFixed(6)}`,
  )
  console.log(
    `   reasoning pieces: ${one.count("thinking.delta")} (models without reasoning send none)`,
  )
  console.log(`   > ${first.replies[0]?.text.trim().slice(0, 200)}\n`)

  // 2. Tools: it must read package.json to know the version.
  const two = recorder()
  const second = await runAgent({
    config,
    runId: "check-2",
    system,
    tools,
    prompt:
      "Which exact version of Next.js does this project use? Read the files to find out; answer with just the version.",
    onEvent: two.onEvent,
  }).done
  const started = two.events.filter((e) => e.type === "tool.started")
  check(
    "2. tool calls",
    started.length > 0 && two.count("tool.finished") === started.length,
    started.map((e) => (e.type === "tool.started" ? e.summary : "")).join(", "),
  )
  check(
    "   answer from the file",
    /16\.3\.8/.test(second.replies.at(-1)?.text ?? ""),
    second.replies.at(-1)?.text.trim().slice(0, 80),
  )
  console.log()

  // 3. Carry on from a saved transcript (as the worker will after a restart or an answer).
  const saved = JSON.parse(JSON.stringify(second.messages))
  const third = await runAgent({
    config,
    runId: "check-3",
    system,
    tools,
    messages: saved,
    prompt: "And what did you just tell me the version was?",
  }).done
  check(
    "3. continues from a saved transcript",
    /16\.3\.8/.test(third.replies.at(-1)?.text ?? ""),
    third.replies.at(-1)?.text.trim().slice(0, 80),
  )
  console.log()

  // 4. Cancel mid-reply.
  const controller = new AbortController()
  const four = recorder()
  const startedAt = Date.now()
  const fourth = await runAgent({
    config,
    runId: "check-4",
    system,
    prompt: "Write a 1500-word essay about web frameworks.",
    signal: controller.signal,
    onEvent: (e) => {
      four.onEvent(e)
      if (e.type === "text.delta" && four.count("text.delta") === 3)
        controller.abort()
    },
  }).done
  check(
    "4. cancel stops the run",
    fourth.stopReason === "aborted" && Date.now() - startedAt < 60_000,
    `stop=${fourth.stopReason}, ${four.count("text.delta")} pieces`,
  )
  console.log()

  // 5. The fast model answers too.
  const fifth = await runAgent({
    config,
    runId: "check-5",
    model: "fast",
    thinking: "off",
    system,
    prompt: "Reply with the single word: ready",
  }).done
  check(
    "5. fast model",
    fifth.stopReason === "stop" && /ready/i.test(fifth.replies[0]?.text ?? ""),
    `${fifth.calls[0]?.model}: ${fifth.replies[0]?.text.trim().slice(0, 40)}`,
  )

  console.log()

  // 6. The context builder (I4a).
  const big = [
    ...Array.from({ length: 900 }, (_, i) => `components/ui/part-${i}.tsx`),
    ...Array.from({ length: 40 }, (_, i) => `app/route-${i}/page.tsx`),
    "node_modules/react/index.js",
    ".next/build.js",
    ".forgeai/NOTES.md",
    "package.json",
  ]
  const tree = compactFileTree(big)
  const treeLines = tree.text.split("\n")
  check(
    "6. file tree collapses and skips ignored folders",
    treeLines.length <= 300 &&
      tree.text.includes("components/ui/ (900 files)") &&
      !/node_modules|\.next|\.forgeai/.test(tree.text),
    `${treeLines.length} lines`,
  )

  // 15 exchanges with the kinds of cards a real chat has.
  const chat: ContextChatMessage[] = []
  for (let i = 1; i <= 15; i++) {
    chat.push({
      role: "USER",
      kind: "TEXT",
      content: `Request ${i}: please add feature number ${i}.`,
      payload: null,
      authorName: i % 2 ? "Sajal" : "Asha",
    })
    if (i === 3)
      chat.push({
        role: "AGENT",
        kind: "TASK",
        content: "",
        payload: {
          tasks: [
            { label: "Header", status: "done" },
            { label: "Footer", status: "active" },
          ],
        },
      })
    if (i === 4)
      chat.push({
        role: "SYSTEM",
        kind: "REPO_PUSH",
        content: "Pushed to GitHub",
        payload: { commitHash: "abc123" },
      })
    chat.push({
      role: "AGENT",
      kind: "TEXT",
      content: `Done: feature ${i} added in app/feature-${i}.tsx.`,
      payload: null,
    })
    if (i === 15)
      chat.push({
        role: "AGENT",
        kind: "FILES",
        content: "",
        payload: { files: [{ path: "app/feature-15.tsx", action: "created" }] },
      })
  }
  const ctx = buildContext({
    project: {
      name: "Seat booking",
      description: "Book seats for events.",
      stack: ["Next.js", "TypeScript"],
      template: { name: "nextjs-starter", version: "1.0.0" },
      devCommand: "npm run dev",
      devPort: 3000,
      info: null,
    },
    files: listFiles(),
    notes: "Uses Tailwind. Keep components small.",
    chat,
    chatSummary: "The project started as a seat booking demo.",
    related: "app/page.tsx: export default function Home() { ... }",
    now: {
      openFiles: [{ path: "app/page.tsx", people: ["Asha"] }],
      devServer: { state: "running", url: "https://3000-x.e2b.app" },
    },
    message: { text: "What was request 14 about?", authorName: "Sajal" },
  })
  const people = ctx.history.filter((t) => t.role === "user")
  check(
    "   only the last 6 exchanges are sent",
    people.length === MIN_RECENT_EXCHANGES &&
      people[0]!.text.includes("Request 10") &&
      people.at(-1)!.text.includes("Request 15"),
    `first sent: "${people[0]?.text.slice(0, 30)}"`,
  )
  check(
    "   older ones come back to fold",
    ctx.unsummarized.filter((t) => t.role === "user").length === 9 &&
      ctx.foldCount > 0 &&
      chat[ctx.foldCount]!.content.startsWith("Request 10"),
    `foldCount ${ctx.foldCount}`,
  )
  check(
    "   cards become one line, system cards are left out",
    !ctx.history
      .concat(ctx.unsummarized)
      .some((t) => t.text.includes("Pushed to GitHub")) &&
      ctx.unsummarized.some((t) => t.text.includes("(plan, 1/2 done)")) &&
      ctx.history.some((t) =>
        t.text.includes("(changed files) app/feature-15.tsx"),
      ),
  )
  check(
    "   names are kept for each person",
    people.some((t) => t.text.startsWith("Asha:")) &&
      people.some((t) => t.text.startsWith("Sajal:")),
  )
  check(
    "   summary in the system prompt, live state in the last turn",
    ctx.system.includes("seat booking demo") &&
      !ctx.system.includes("3000-x.e2b.app") &&
      ctx.prompt.includes("<now>") &&
      ctx.prompt.includes(
        '<message from="Sajal">\nWhat was request 14 about?\n</message>',
      ),
  )
  const over = Object.entries(ctx.tokens).filter(
    ([k, v]) =>
      k in CONTEXT_BUDGETS &&
      v > CONTEXT_BUDGETS[k as keyof typeof CONTEXT_BUDGETS],
  )
  check(
    "   every section within its budget",
    over.length === 0,
    Object.entries(ctx.tokens)
      .map(([k, v]) => `${k} ${v}`)
      .join(", "),
  )

  const sixth = await runAgent({
    config,
    runId: "check-6",
    system: ctx.system,
    history: ctx.history,
    prompt: ctx.prompt,
    thinking: "off",
  }).done
  check(
    "   the model sees the earlier turns",
    /feature (number )?14|feature-14|feature 14/i.test(
      sixth.replies.at(-1)?.text ?? "",
    ),
    sixth.replies.at(-1)?.text.trim().slice(0, 80),
  )

  const folded = await summarizeHistory(
    config,
    "The project started as a seat booking demo.",
    ctx.unsummarized,
  )
  check(
    "   summary folds the older exchanges (fast model)",
    folded.folded === ctx.unsummarized.length &&
      folded.summary.length > 20 &&
      !folded.error,
    `${folded.call?.model}, ${folded.summary.length} chars, $${((folded.call?.costMicros ?? 0) / 1e6).toFixed(6)}`,
  )
  console.log(`   > ${folded.summary.replace(/\s+/g, " ").slice(0, 160)}`)

  console.log(
    `\n${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

void main()
