import assert from "node:assert/strict"
import { hermesSessionStreamToUIMessageStream } from "./hermes/stream"
import { parseRunFrames, pendingApproval, stateFromEvents, taskState, titleFrom } from "./tasks"

assert.equal(taskState("running"), "working")
assert.equal(taskState("waiting_for_approval"), "needs-input")
assert.equal(taskState("queued"), "idle")
assert.equal(taskState("completed"), "done")
assert.equal(taskState("cancelled"), "stopped")
assert.equal(taskState("interrupted"), "failed")
assert.equal(titleFrom("a".repeat(100) + "\nsecond").length, 80)

// Run frames: `id:` + `data:` only, comment frames skipped, partial frame kept.
const wire = [
  ": open\n\n",
  'id: 0\ndata: {"event":"tool.started","tool":"terminal","preview":"echo hi","seq":0}\n\n',
  'id: 1\ndata: {"event":"tool.completed","tool":"terminal","error":false,"preview":"{\\"output\\":\\"hi\\"}","seq":1}\n\n',
  'id: 2\ndata: {"event":"approval.request","command":"rm x","choices":["once","deny"],"seq":2}\n\n',
  'id: 3\ndata: {"event":"mess',
].join("")
const { events, rest } = parseRunFrames(wire)
assert.deepEqual(
  events.map((e) => e.event),
  ["tool.started", "tool.completed", "approval.request"]
)
assert.ok(rest.startsWith("id: 3"))
assert.equal(stateFromEvents(events), "needs-input")
assert.deepEqual(pendingApproval(events), {
  command: "rm x",
  description: undefined,
  requestId: undefined,
  choices: ["once", "deny"],
})
assert.equal(pendingApproval([...events, { event: "approval.responded", seq: 3 }]), null)
assert.equal(stateFromEvents([...events, { event: "run.cancelled" }]), "stopped")

// The chat mapper reads run events: tool card, subagent card, text, final output.
const sse = [
  { event: "tool.started", tool: "terminal", preview: "echo hi", seq: 0 },
  { event: "tool.completed", tool: "terminal", error: false, preview: '{"output":"hi"}', seq: 1 },
  { event: "subagent.start", subagent_id: "s1", goal: "look", seq: 2 },
  { event: "subagent.complete", subagent_id: "s1", status: "completed", summary: "found", seq: 3 },
  { event: "message.delta", delta: "do", seq: 4 },
  { event: "message.delta", delta: "ne", seq: 5 },
  { event: "run.completed", output: "done", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }, seq: 6 },
]
  .map((e) => `id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`)
  .join("")
async function main() {
  let message: { parts: { type: string; state?: string; text?: string }[] } | undefined
  const reader = hermesSessionStreamToUIMessageStream(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(sse))
        c.close()
      },
    }),
    { onFinish: ({ message: m }) => {
        message = m as typeof message
      },
    }
  ).getReader()
  while (!(await reader.read()).done);
  const types = message!.parts.map((p) => p.type)
  assert.ok(types.includes("tool-terminal") && types.includes("tool-subagent"), types.join())
  assert.ok(message!.parts.filter((p) => p.type.startsWith("tool-")).every((p) => p.state === "output-available"))
  // run.completed output equals the streamed text, so it is not appended twice.
  assert.equal(
    message!.parts.filter((p) => p.type === "text").map((p) => p.text).join(""),
    "done"
  )
  console.log("tasks.test ok")
}
void main()
