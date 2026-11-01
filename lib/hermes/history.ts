import type { UIMessage } from "ai"
import { parseJsonOr, reasoningPart, textPart, toolPart } from "./parts"

// Maps a page of Hermes session rows (GET /api/sessions/{id}/messages) to UI
// messages. Rows are flat: `user`, `assistant` (text and/or `tool_calls`,
// optional `reasoning`) and `tool` (`tool_call_id`, `tool_name`, JSON `content`
// result). A user row starts a message, and the run of assistant/tool rows up
// to the next user row is one assistant message, like a live turn.

export type HermesRow = {
  id: number
  role: string
  content: string | null
  timestamp: number | null
  tool_call_id: string | null
  tool_calls:
    | { id: string; function?: { name?: string; arguments?: string } }[]
    | null
  tool_name: string | null
  reasoning: string | null
  reasoning_content: string | null
}

type HistoryMessage = UIMessage<{ createdAt?: string }>

const iso = (ts: number | null) =>
  ts ? new Date(ts * 1000).toISOString() : undefined

export function rowsToMessages(rows: HermesRow[]): HistoryMessage[] {
  const out: HistoryMessage[] = []
  let assistant: HistoryMessage | null = null
  // Where each tool call sits in `assistant.parts`, to fill in its result.
  const calls = new Map<string, number>()

  for (const row of rows) {
    if (row.role === "user") {
      assistant = null
      out.push({
        id: `h${row.id}`,
        role: "user",
        parts: row.content ? [textPart(row.content)] : [],
        metadata: { createdAt: iso(row.timestamp) },
      })
    } else if (row.role === "assistant") {
      if (!assistant) {
        assistant = {
          id: `h${row.id}`,
          role: "assistant",
          parts: [],
          metadata: { createdAt: iso(row.timestamp) },
        }
        out.push(assistant)
      }
      const thinking = (row.reasoning || row.reasoning_content || "").trim()
      if (thinking) assistant.parts.push(reasoningPart(thinking))
      if (row.content?.trim()) assistant.parts.push(textPart(row.content))
      for (const call of row.tool_calls ?? []) {
        calls.set(call.id, assistant.parts.length)
        // Shown as a failed call unless a tool row with its result follows.
        assistant.parts.push(
          toolPart({
            toolName: call.function?.name ?? "tool",
            toolCallId: call.id,
            input: parseJsonOr<unknown>(call.function?.arguments ?? "{}", () => ({})),
            errorText: "No result recorded",
          })
        )
      }
    } else if (row.role === "tool" && assistant && row.tool_call_id) {
      // ponytail: a tool row whose call is on an older page is dropped; pages
      // start at a user row (see app/api/history/route.ts) so this is rare.
      const at = calls.get(row.tool_call_id)
      if (at === undefined) continue
      const call = assistant.parts[at] as { type: string; input: unknown }
      assistant.parts[at] = toolPart({
        toolName: call.type.slice("tool-".length),
        toolCallId: row.tool_call_id,
        input: call.input,
        output: parseJsonOr<unknown>(row.content ?? "", (r) => r),
      })
    }
  }
  return out.filter((m) => m.parts.length > 0)
}
