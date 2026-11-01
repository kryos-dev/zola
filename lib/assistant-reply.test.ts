import assert from "node:assert/strict"
import test from "node:test"
import {
  EMPTY_REPLY_TEXT,
  persistedAssistantReply,
} from "./assistant-reply"

test("an empty final reply gets an explicit visible fallback", () => {
  const result = persistedAssistantReply([{ type: "text", text: "   " }])
  assert.ok(result)
  assert.equal(result.content, EMPTY_REPLY_TEXT)
  assert.equal(result.parts.at(-1)?.text, EMPTY_REPLY_TEXT)
})

test("a tool-only reply does not persist as an empty assistant message", () => {
  const result = persistedAssistantReply([
    { type: "tool-terminal", state: "output-available" },
  ])
  assert.ok(result)
  assert.equal(result.content, EMPTY_REPLY_TEXT)
  assert.equal(result.parts.length, 2)
})

test("a real text reply is preserved without a fallback", () => {
  const parts = [
    { type: "tool-terminal", state: "output-available" },
    { type: "text", text: "The result is 42." },
  ]
  assert.deepEqual(persistedAssistantReply(parts), {
    parts,
    content: "The result is 42.",
  })
})

test("bookkeeping-only events still show that no text response was produced", () => {
  const result = persistedAssistantReply([{ type: "data-turn" }])
  assert.ok(result)
  assert.equal(result.content, EMPTY_REPLY_TEXT)
  const finalPart = result.parts.at(-1)
  assert.equal(finalPart?.type, "text")
  assert.equal(
    finalPart && "text" in finalPart ? finalPart.text : undefined,
    EMPTY_REPLY_TEXT
  )
})

test("a completed message with no parts gets a visible fallback", () => {
  const result = persistedAssistantReply([])
  assert.ok(result)
  assert.equal(result.content, EMPTY_REPLY_TEXT)
})
