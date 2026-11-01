import { profileBase } from "./profiles"
import { sessionKeyFor } from "./client"

// Server-side client for Hermes detached runs (gateway/platforms/api_server_runs.py).
// Routes live under the profile's base url (`/p/<profile>/v1/runs`), with that
// profile's bearer key.

const headers = (profile: string, extra?: Record<string, string>) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${profileBase(profile).key}`,
  ...extra,
})

const url = (profile: string, path: string) => `${profileBase(profile).baseUrl}/v1/runs${path}`

/** Starts a run on the user's rolling session so the transcript stays unified; returns its run id. */
export async function createRun(args: {
  profile: string
  username: string
  sessionId: string
  text: string
  idempotencyKey: string
}): Promise<string> {
  const res = await fetch(url(args.profile, ""), {
    method: "POST",
    headers: headers(args.profile, {
      "Idempotency-Key": args.idempotencyKey,
      "X-Hermes-Session-Key": sessionKeyFor(args.username, args.profile),
    }),
    body: JSON.stringify({ input: args.text, session_id: args.sessionId }),
  })
  if (!res.ok) throw new Error(`Hermes run create failed (${res.status}): ${await res.text().catch(() => "")}`)
  const id = ((await res.json()) as { run_id?: string }).run_id
  if (!id) throw new Error("Hermes run create returned no run id")
  return id
}

export type RunStatus = { status?: string; output?: string; error?: unknown; updated_at?: number }

/** GET /v1/runs/{id}; null when Hermes no longer knows the run (404) or is unreachable. */
export async function getRun(profile: string, runId: string): Promise<RunStatus | null> {
  const res = await fetch(url(profile, `/${encodeURIComponent(runId)}`), {
    headers: headers(profile),
    cache: "no-store",
  }).catch(() => null)
  return res?.ok ? ((await res.json()) as RunStatus) : null
}

/** Opens the run's event SSE, resuming after `lastEventId` when given. */
export function openRunEvents(profile: string, runId: string, lastEventId: string | null, signal: AbortSignal) {
  return fetch(url(profile, `/${encodeURIComponent(runId)}/events`), {
    headers: headers(profile, lastEventId ? { "Last-Event-ID": lastEventId } : undefined),
    signal,
    cache: "no-store",
  })
}

/** Forwards a control call (steer | stop | approval) and returns Hermes' response. */
export function controlRun(profile: string, runId: string, action: "steer" | "stop" | "approval", body: unknown) {
  return fetch(url(profile, `/${encodeURIComponent(runId)}/${action}`), {
    method: "POST",
    headers: headers(profile),
    body: JSON.stringify(body ?? {}),
  })
}
