"use client"

import { hermesSessionStreamToUIMessageStream } from "@/lib/hermes/stream"
import { parseRunFrames, type RunEvent } from "@/lib/tasks"
import { readUIMessageStream, type UIMessage } from "ai"
import { useEffect, useState } from "react"

const TERMINAL = ["run.completed", "run.failed", "run.cancelled", "run.interrupted"]

// Folds the events seen so far into one assistant message with the chat's own
// mapper, so tool calls, subagents and text render as in the conversation.
// ponytail: the whole buffer is re-mapped per update (Hermes keeps at most 1000
// events); map incrementally if feeds ever outgrow that.
async function toMessage(events: RunEvent[]): Promise<UIMessage | undefined> {
  const bytes = new TextEncoder().encode(
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
  )
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes)
      c.close()
    },
  })
  let last: UIMessage | undefined
  try {
    for await (const m of readUIMessageStream({
      stream: hermesSessionStreamToUIMessageStream(source),
      onError: () => {},
    })) {
      last = m
    }
  } catch {
    // a failed run ends in an error chunk; whatever was built stays
  }
  return last
}

/**
 * Live feed of a task: GET /api/tasks/{id}/events, reconnecting with
 * Last-Event-ID when the page returns to the foreground or the stream drops.
 * `truncated` is set when Hermes dropped events past its backlog, and
 * `unavailable` when it no longer has the run's stream at all; the caller then
 * falls back to the run status.
 */
export function useRunFeed(runId: string) {
  const [events, setEvents] = useState<RunEvent[]>([])
  const [message, setMessage] = useState<UIMessage>()
  const [truncated, setTruncated] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const done = events.some((e) => TERMINAL.includes(e.event))

  useEffect(() => {
    if (done) return
    const ac = new AbortController()
    let retry: ReturnType<typeof setTimeout> | undefined
    const lastSeq = events.reduce((n, e) => Math.max(n, e.seq ?? -1), -1)

    ;(async () => {
      const res = await fetch(`/api/tasks/${encodeURIComponent(runId)}/events`, {
        headers: lastSeq >= 0 ? { "Last-Event-ID": String(lastSeq) } : undefined,
        signal: ac.signal,
      })
      if (!res.ok || !res.body) {
        setUnavailable(true)
        return
      }
      setUnavailable(false)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      for (;;) {
        const { done: end, value } = await reader.read()
        if (end) break
        buf += decoder.decode(value, { stream: true })
        const parsed = parseRunFrames(buf)
        buf = parsed.rest
        if (parsed.events.some((e) => e.event === "replay.truncated")) setTruncated(true)
        const fresh = parsed.events.filter((e) => e.seq !== undefined && e.seq > lastSeq)
        if (fresh.length) setEvents((prev) => [...prev, ...fresh])
      }
      // Closed without a terminal event (proxy timeout, network): ask again.
      retry = setTimeout(() => setAttempt((n) => n + 1), 2000)
    })().catch(() => {
      if (!ac.signal.aborted) retry = setTimeout(() => setAttempt((n) => n + 1), 4000)
    })

    return () => {
      ac.abort()
      clearTimeout(retry)
    }
    // `events` is read for lastSeq only when (re)connecting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, attempt, done])

  // Reconnect with Last-Event-ID when the app returns to the foreground.
  useEffect(() => {
    const wake = () => document.visibilityState === "visible" && setAttempt((n) => n + 1)
    document.addEventListener("visibilitychange", wake)
    window.addEventListener("focus", wake)
    return () => {
      document.removeEventListener("visibilitychange", wake)
      window.removeEventListener("focus", wake)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      const m = await toMessage(events)
      if (!cancelled) setMessage(m)
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [events])

  return { events, message, truncated, unavailable, done }
}
