import assert from "node:assert/strict"
import { rowsToMessages, type HermesRow } from "./history"

const row = (r: Partial<HermesRow> & Pick<HermesRow, "id" | "role">): HermesRow => ({
  content: null,
  timestamp: 1793522624,
  tool_call_id: null,
  tool_calls: null,
  tool_name: null,
  reasoning: null,
  reasoning_content: null,
  ...r,
})

// Shape observed on a real session: user, assistant with tool_calls, tool, assistant.
const msgs = rowsToMessages([
  row({ id: 1, role: "user", content: "read it" }),
  row({
    id: 2,
    role: "assistant",
    content: "I will read the file.",
    reasoning: "thinking",
    tool_calls: [
      { id: "c1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
      { id: "c2", function: { name: "skills_list", arguments: "{}" } },
    ],
  }),
  row({ id: 3, role: "tool", tool_call_id: "c1", tool_name: "read_file", content: '{"total_lines":4}' }),
  row({ id: 4, role: "assistant", content: "done" }),
])

assert.equal(msgs.length, 2)
assert.deepEqual(msgs.map((m) => m.id), ["h1", "h2"])
const parts = msgs[1].parts as { type: string; state?: string; output?: unknown; text?: string }[]
assert.deepEqual(
  parts.map((p) => p.type),
  ["reasoning", "text", "tool-read_file", "tool-skills_list", "text"]
)
assert.equal(parts[2].state, "output-available")
assert.deepEqual(parts[2].output, { total_lines: 4 })
assert.equal(parts[3].state, "output-error")
console.log("history tests ok")
