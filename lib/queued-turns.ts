export type QueuedTurn = { id: string }

export function enqueueTurn<T extends QueuedTurn>(queue: T[], turn: T): T[] {
  return [...queue, turn]
}

export function dequeueTurn<T extends QueuedTurn>(
  queue: T[]
): { turn: T; queue: T[] } | null {
  const [turn, ...rest] = queue
  return turn ? { turn, queue: rest } : null
}

export function removeTurn<T extends QueuedTurn>(queue: T[], id: string): T[] {
  return queue.filter((turn) => turn.id !== id)
}
