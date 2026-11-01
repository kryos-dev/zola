// Background tasks are Hermes detached runs (POST /v1/runs). This file holds the
// pure, client-safe parts: Hermes run status -> the task vocabulary, and the
// parser for the run event stream (`id: <seq>\ndata: {"event": ..., ...}`;
// unlike the session stream there is no `event:` line).

export type TaskState = "working" | "needs-input" | "idle" | "done" | "failed" | "stopped"

export const TASK_STATE_LABEL: Record<TaskState, string> = {
  working: "Working",
  "needs-input": "Needs input",
  idle: "Idle",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
}

/** Hermes run status (api_server_runs.py TERMINAL_STATUSES + live ones) to a task state. */
export function taskState(status: string | undefined): TaskState {
  switch (status) {
    case "running":
    case "stopping":
      return "working"
    case "waiting_for_approval":
      return "needs-input"
    case "queued":
      return "idle"
    case "completed":
      return "done"
    case "cancelled":
      return "stopped"
    case "failed":
    case "interrupted":
      return "failed"
    default:
      // Hermes forgot the run (status TTL) or the lookup failed; it is over.
      return "done"
  }
}

export const isActiveState = (s: TaskState) => s === "working" || s === "needs-input"

export type RunEvent = { event: string; seq?: number; [key: string]: unknown }

/** Splits complete SSE frames off the front of `buf`; returns the parsed events and the unread rest. */
export function parseRunFrames(buf: string): { events: RunEvent[]; rest: string } {
  const events: RunEvent[] = []
  let rest = buf
  let i: number
  while ((i = rest.indexOf("\n\n")) !== -1) {
    const frame = rest.slice(0, i)
    rest = rest.slice(i + 2)
    const data = frame
      .split("\n")
      .find((l) => l.startsWith("data:"))
      ?.slice(5)
      .trim()
    if (!data) continue
    try {
      const e = JSON.parse(data) as RunEvent
      if (typeof e.event === "string") events.push(e)
    } catch {
      // a malformed frame is skipped
    }
  }
  return { events, rest }
}

export type PendingApproval = {
  command?: string
  description?: string
  requestId?: string
  choices: string[]
}

/** The approval the run is waiting on, if the newest approval.request has no response after it. */
export function pendingApproval(events: RunEvent[]): PendingApproval | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (
      e.event === "approval.responded" ||
      ["run.completed", "run.failed", "run.cancelled", "run.interrupted"].includes(e.event)
    )
      return null
    if (e.event === "approval.request") {
      const str = (v: unknown) => (typeof v === "string" ? v : undefined)
      return {
        command: str(e.command),
        description: str(e.description),
        requestId: str(e.request_id),
        choices: Array.isArray(e.choices) ? e.choices.filter((c) => typeof c === "string") : ["once", "deny"],
      }
    }
  }
  return null
}

/** The run state implied by the newest lifecycle event, to update a task before the next status poll. */
export function stateFromEvents(events: RunEvent[]): TaskState | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i].event
    if (e === "approval.request") return "needs-input"
    if (e === "run.completed") return "done"
    if (e === "run.cancelled") return "stopped"
    if (e === "run.failed" || e === "run.interrupted") return "failed"
    if (e === "approval.responded" || e === "tool.started" || e === "message.delta") return "working"
  }
  return null
}

/** Task title from the prompt: first line, trimmed to 80 characters. */
export function titleFrom(text: string): string {
  const line = text.trim().split("\n")[0] ?? ""
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

/** Hermes run statuses that never change again (TERMINAL_STATUSES in api_server_runs.py). */
export const TERMINAL_STATUSES = ["completed", "failed", "cancelled", "interrupted"]
