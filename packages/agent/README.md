# @forgeAI/agent

Model integration for the [agent worker](../../apps/agent-worker/README.md).
The loop uses `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai`, pinned in
[package.json](package.json), behind `runAgent()`. The package also builds bounded
context, classifies requests, summarizes history and maps retrieval events.

```ts
const config = agentConfigFromEnv(process.env)
const run = runAgent({
  config,
  runId,
  system,
  messages: saved,
  prompt,
  tools,
  signal,
  onEvent,
})
run.steer("also add a footer") // a message sent while it works
const result = await run.done // transcript to save, replies, usage per model call
```

- `onEvent` gets the live `AgentEvent`s (`text.delta`, `thinking.delta`, `tool.*`, `run.usage`); the worker publishes
  them on `agent-events` and sends `run.status` itself.
- `result.messages` is the whole transcript: save it, and pass it back as `messages` to carry on after an answer or a restart.
- `result.calls` has one entry per model call, for `UsageEvent` rows. Cost estimates come from the installed pi-ai catalog; provider billing is authoritative.
- Tools are pi tools (TypeBox `parameters`, `execute(id, params, signal, onUpdate)`) plus an optional `summarize(args)` for
  the line people see ("Reading app/page.tsx"). A tool streams output by calling `onUpdate` with the new text.

## Knowledge graph events

`indexEventFromRag(runId, line)` turns each NDJSON line of the RAG service's `/index` into an `index.status` event, and
`searchEventFromRag(runId, query, hits)` turns its `/search` answer into `search.done`. Publish them on `agent-events`, and
the Agent tab shows the progress and a clickable list of what was found.

## Context

`buildContext(input)` turns data the worker has already fetched into what a run is told, within budgets. It's
pure code, no model:

```ts
const ctx = buildContext({
  project,
  files,
  notes,
  chat,
  chatSummary,
  related,
  now,
  message,
})
const run = runAgent({
  config,
  runId,
  system: ctx.system,
  history: ctx.history,
  prompt: ctx.prompt,
  tools,
  onEvent,
})
if (ctx.unsummarized.length) {
  const { summary } = await summarizeHistory(
    config,
    chatSummary,
    ctx.unsummarized,
  ) // fast model
  // save summary, and that it now covers chat[0 .. ctx.foldCount)
}
```

| Part                                                                      | Goes in                | Budget (tokens)                      |
| ------------------------------------------------------------------------- | ---------------------- | ------------------------------------ |
| Instructions, project (brief, file tree, NOTES.md), chat summary          | system prompt (cached) | ~2k + 8k + 2k                        |
| Earlier exchanges, words only, with names                                 | real turns (`history`) | 15k; all while ≤ 12, then the last 6 |
| Related code and docs, now (open files, dev server), the message as typed | the last turn          | 6k + 2k                              |

## Settings

The consuming worker passes its environment to `agentConfigFromEnv`; this package
does not load a package-local environment for application runs. See
[.env.example](.env.example) for sample values.

| Setting                | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `AGENT_PROVIDER`       | Provider identifier supported by the installed model library            |
| `AGENT_API_KEY`        | Credential for that provider                                            |
| `AGENT_BASE_URL`       | Optional compatible endpoint override                                   |
| `AGENT_MODEL_CODE`     | Main tool-capable model identifier                                      |
| `AGENT_MODEL_FAST`     | Classification and summary model identifier                             |
| `AGENT_MODEL_FALLBACK` | Optional fallback for eligible failures before output or tool execution |
| `AGENT_THINKING`       | `off`, `low`, `medium` or `high`                                        |

Model availability, capabilities and prices depend on the configured provider.
The examples are configuration samples, not pricing recommendations.

## Checks

From the repository root:

```powershell
bun run --cwd packages/agent typecheck
bun run --cwd packages/agent lint
```

For the optional live provider smoke check, copy `.env.example` to `.env` in this
package and run `bun run check` from this directory. It makes real model requests
for streaming, tools, transcript continuation, cancellation and the fast model,
and may incur charges. The script is [scripts/check-agent.ts](scripts/check-agent.ts).
