// Team screen data: a pure client of the Hermes dashboard (profiles, Kanban plugin,
// learning graph). State is derived here from Kanban facts; nothing is stored.
import { dashboardJson, jsonBody } from "@/lib/cloud9/dashboard"

const KANBAN = "/api/plugins/kanban"
const enc = encodeURIComponent

export type AgentState = "working" | "needs_input" | "idle"

type RawTask = {
  id: string
  title: string
  assignee: string | null
  status: string
  block_kind: string | null
  created_at?: number | null
  started_at?: number | null
  completed_at?: number | null
  last_heartbeat_at?: number | null
  latest_summary?: string | null
  comment_count?: number
}
export type RawBoard = { columns: { name: string; tasks: RawTask[] }[] }
export type RawWorker = { profile?: string | null; task_assignee?: string | null }
export type RawProfile = { name: string; gateway_running?: boolean }

export type Card = {
  id: string
  title: string
  assignee: string | null
  state: string
  blockKind: string | null
  updated: number
  summary: string | null
  comments: number
}

const DONE_KEEP = 10 // finished cards are history; the board only needs the latest few

export function toCard(t: RawTask, column: string): Card {
  const times = [t.created_at, t.started_at, t.completed_at, t.last_heartbeat_at]
  return {
    id: t.id,
    title: t.title,
    assignee: t.assignee,
    state: column,
    blockKind: t.block_kind,
    updated: Math.max(0, ...times.map((x) => x ?? 0)),
    summary: t.latest_summary ?? null,
    comments: t.comment_count ?? 0,
  }
}

export const isWaiting = (c: Card) =>
  (c.state === "blocked" && c.blockKind === "needs_input") || c.state === "review"

export function groupBoard(board: RawBoard) {
  const columns: Record<string, Card[]> = {}
  for (const col of board.columns) {
    const cards = col.tasks.map((t) => toCard(t, col.name)).sort((a, b) => b.updated - a.updated)
    columns[col.name] = col.name === "done" ? cards.slice(0, DONE_KEEP) : cards
  }
  const waitingOnYou = Object.values(columns).flat().filter(isWaiting)
  return { columns, waitingOnYou }
}

export function deriveState(name: string, cards: Card[], workers: RawWorker[]): AgentState {
  const mine = cards.filter((c) => c.assignee === name)
  if (workers.some((w) => w.profile === name || w.task_assignee === name)) return "working"
  if (mine.some((c) => c.state === "running")) return "working"
  if (mine.some(isWaiting)) return "needs_input"
  return "idle"
}

export async function loadBoard() {
  const res = await dashboardJson<RawBoard>(`${KANBAN}/board`)
  return res.ok ? { ok: true as const, ...groupBoard(res.data) } : res
}

export async function loadRoster(configured: { name: string; label: string; role: string }[]) {
  const [profiles, board, workers] = await Promise.all([
    dashboardJson<{ profiles: RawProfile[] }>("/api/profiles"),
    loadBoard(),
    dashboardJson<{ workers: RawWorker[] }>(`${KANBAN}/workers/active`),
  ])
  if (!profiles.ok) return profiles
  const cards = board.ok ? Object.values(board.columns).flat() : []
  const w = workers.ok ? workers.data.workers : []
  return {
    ok: true as const,
    agents: configured.map((p) => {
      const mine = cards.filter((c) => c.assignee === p.name)
      return {
        ...p,
        online: profiles.data.profiles.find((x) => x.name === p.name)?.gateway_running === true,
        state: deriveState(p.name, cards, w),
        counts: {
          running: mine.filter((c) => c.state === "running").length,
          waiting: mine.filter(isWaiting).length,
          open: mine.filter((c) => c.state !== "done").length,
        },
      }
    }),
  }
}

export type MemoryNode = { id: string; label: string; category: string; timestamp: number }

export async function loadMemory(profile: string) {
  const res = await dashboardJson<{ nodes: (MemoryNode & { kind: string })[] }>(
    `/api/learning/graph?profile=${enc(profile)}`
  )
  if (!res.ok) return res
  const nodes = res.data.nodes
    .filter((n) => n.kind === "memory")
    .map(({ id, label, category, timestamp }) => ({ id, label, category, timestamp }))
  return { ok: true as const, nodes }
}

export const createCard = (body: { title: string; assignee: string; body: string }) =>
  dashboardJson<{ task: { id: string } }>(`${KANBAN}/tasks`, jsonBody("POST", body))

export const loadCard = (id: string) =>
  dashboardJson<{
    task: RawTask & { body?: string; result?: string | null }
    comments: { id: number; author: string; body: string; created_at: number }[]
  }>(`${KANBAN}/tasks/${enc(id)}`)

export const addComment = (id: string, body: string) =>
  dashboardJson(`${KANBAN}/tasks/${enc(id)}/comments`, jsonBody("POST", { body }))
