import assert from "node:assert/strict"
import test from "node:test"
import { chatSendIntent } from "./chat-send-intent"

test("a typed follow-up while a turn is active is queued, not a stop", () => {
  assert.equal(chatSendIntent("streaming", "add one more thing", 0), "queue")
})

test("an attachment-only follow-up while active is queued", () => {
  assert.equal(chatSendIntent("submitted", "", 1), "queue")
})

test("an empty composer while streaming still stops the active turn", () => {
  assert.equal(chatSendIntent("streaming", "  ", 0), "stop")
})

test("a normal message sends immediately when no turn is active", () => {
  assert.equal(chatSendIntent("ready", "hello", 0), "send")
})

test("an empty idle composer does nothing", () => {
  assert.equal(chatSendIntent("ready", "", 0), "ignore")
})
