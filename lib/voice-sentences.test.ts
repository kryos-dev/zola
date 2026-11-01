// node --import tsx lib/voice-sentences.test.ts
import assert from "node:assert/strict"
import test from "node:test"
import { speakable, takeSpeech } from "./voice-sentences"

test("speakable strips markdown and emoji", () => {
  assert.equal(speakable("## **Hi** there 😀 see [docs](http://x.y) `ls`"), "Hi there see docs ls")
})

test("streams sentence by sentence", () => {
  let text = "Sure, I can help with that. Here is the"
  let r = takeSpeech(text, 0, false)
  assert.deepEqual(r.chunks, ["Sure, I can help with that."])
  text += " plan for today. It has 3.5 steps."
  r = takeSpeech(text, r.next, false)
  assert.deepEqual(r.chunks, ["Here is the plan for today."])
  r = takeSpeech(text, r.next, true)
  assert.deepEqual(r.chunks, ["It has 3.5 steps."])
  assert.equal(r.next, text.length)
})

test("short sentences are merged and code is skipped", () => {
  const text = "Ok. Done now, really.\n```js\nlet a = 1.\n```\nBye for now, friend! "
  const r = takeSpeech(text, 0, true)
  assert.deepEqual(r.chunks, ["Ok. Done now, really.", "Bye for now, friend!"])
})

test("an open code fence is held until it closes", () => {
  const r = takeSpeech("Here is the code you need. ```py\nprint(1)", 0, false)
  assert.deepEqual(r.chunks, ["Here is the code you need."])
  assert.deepEqual(takeSpeech("```py\nprint(1)", 0, true).chunks, [])
})
