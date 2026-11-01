import assert from "node:assert/strict"
import test from "node:test"
import { dequeueTurn, enqueueTurn, removeTurn, type QueuedTurn } from "./queued-turns"

type Turn = QueuedTurn & { text: string }
const turn = (id: string, text = id): Turn => ({ id, text })

test("queued turns remain visible and drain in FIFO order", () => {
  let queue: Turn[] = []
  queue = enqueueTurn(queue, turn("first"))
  queue = enqueueTurn(queue, turn("second"))

  assert.deepEqual(queue.map((item) => item.id), ["first", "second"])
  const result = dequeueTurn(queue)
  assert.equal(result?.turn.id, "first")
  assert.deepEqual(result?.queue.map((item) => item.id), ["second"])
})

test("removing one queued turn leaves its neighbors in order", () => {
  const queue = [turn("first"), turn("remove"), turn("last")]
  assert.deepEqual(
    removeTurn(queue, "remove").map((item) => item.id),
    ["first", "last"]
  )
})

test("dequeueing an empty queue is explicit", () => {
  assert.equal(dequeueTurn([]), null)
})
