// node --import tsx lib/parts.test.ts
// The exact shape a duplicated reply has, taken from the live transcript: two
// adjacent text parts where the second is the first without its leading
// newlines.
import assert from "node:assert/strict"
import test from "node:test"
import { collapseRepeatedText } from "./parts"

type P = { type: string; text?: string }

test("an answer written twice collapses to one text part", () => {
  const parts: P[] = [
    { type: "text", text: "\n\nDone — it's deployed." },
    { type: "text", text: "Done — it's deployed." },
    { type: "data-turn" },
  ]
  const out = collapseRepeatedText(parts)
  assert.equal(out.filter((p) => p.type === "text").length, 1)
  assert.equal(out[0].text, "\n\nDone — it's deployed.")
  assert.equal(out[1].type, "data-turn")
})

test("text parts a tool call sits between are both kept", () => {
  const parts: P[] = [
    { type: "text", text: "Checking." },
    { type: "tool-terminal" },
    { type: "text", text: "Checking." },
  ]
  assert.equal(collapseRepeatedText(parts).length, 3)
})

test("different text parts are both kept", () => {
  const parts: P[] = [
    { type: "text", text: "First answer." },
    { type: "text", text: "Second answer." },
  ]
  assert.equal(collapseRepeatedText(parts).length, 2)
})

test("a message with no duplicates is returned unchanged", () => {
  const parts: P[] = [
    { type: "tool-terminal" },
    { type: "text", text: "One." },
    { type: "data-turn" },
  ]
  assert.deepEqual(collapseRepeatedText(parts), parts)
})
