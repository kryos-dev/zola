"use client"

import { PageHeader } from "@/app/(cloud9)/_components/page-header"
import { StatusBlock } from "@/app/(cloud9)/_components/status-block"
import { useProfiles } from "@/app/hooks/use-profiles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { fetchClient } from "@/lib/fetch"
import { formatDate } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"

type Agent = {
  name: string
  label: string
  role: string
  online: boolean
  state: "working" | "needs_input" | "idle"
  counts: { running: number; waiting: number; open: number }
}
type Card = {
  id: string
  title: string
  assignee: string | null
  state: string
  updated: number
  summary: string | null
  lastComment?: { author: string; body: string } | null
}
type Board = { columns: Record<string, Card[]>; waitingOnYou: Card[] }
type Detail = {
  task: { id: string; title: string; body: string; assignee: string | null; status: string }
  comments: { id: number; author: string; body: string; created: number }[]
}

// Agents and cards come from Hermes; the screen only polls and renders them.
const POLL_MS = 5000 // TanStack pauses interval refetches while the tab is hidden.

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json()
}

const when = (sec: number) => (sec ? formatDate(new Date(sec * 1000).toISOString()) : "")

function chip(a: Agent) {
  if (!a.online) return { text: "Offline", cls: "bg-muted text-muted-foreground" }
  if (a.state === "working") return { text: "Working", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" }
  if (a.state === "needs_input") return { text: "Needs input", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" }
  return { text: "Idle", cls: "bg-secondary text-secondary-foreground" }
}

function Avatar({ label }: { label: string }) {
  return (
    <span
      className="bg-primary text-primary-foreground inline-flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold"
      aria-hidden
    >
      {label.charAt(0).toUpperCase()}
    </span>
  )
}

function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))] md:mx-auto md:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description ?? ""}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

function CardRow({ card, onOpen }: { card: Card; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      className="hover:bg-accent flex min-h-12 w-full flex-col items-start rounded-lg border px-3 py-2 text-left"
    >
      <span className="line-clamp-2 text-sm font-medium">{card.title}</span>
      <span className="text-muted-foreground text-xs">
        {card.state} · {when(card.updated)}
      </span>
      {card.lastComment ? (
        <span className="text-muted-foreground mt-1 line-clamp-2 text-xs">
          {card.lastComment.author}: {card.lastComment.body}
        </span>
      ) : null}
    </button>
  )
}

function CardDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState("")
  const { data, error } = useQuery<Detail>({
    queryKey: ["team-card", id],
    queryFn: () => getJson(`/api/team/board/${id}`),
    enabled: !!id,
    refetchInterval: POLL_MS,
  })
  const reply = useMutation({
    mutationFn: async () => {
      const res = await fetchClient(`/api/team/board/${id}`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      })
      if (!res.ok) throw new Error("Could not send reply")
    },
    onSuccess: () => {
      setText("")
      void queryClient.invalidateQueries({ queryKey: ["team-card", id] })
      void queryClient.invalidateQueries({ queryKey: ["team-board"] })
    },
    onError: () => toast({ title: "Could not send reply", status: "error" }),
  })

  return (
    <BottomSheet
      open={!!id}
      onClose={onClose}
      title={data?.task.title ?? "Card"}
      description={data ? `${data.task.status} · ${data.task.assignee ?? "unassigned"}` : undefined}
    >
      {error ? <p className="text-destructive text-sm">Could not load the card.</p> : null}
      {data?.task.body ? (
        <p className="text-muted-foreground line-clamp-6 text-sm whitespace-pre-wrap">{data.task.body}</p>
      ) : null}
      <div className="space-y-2">
        {data?.comments.map((c) => (
          <div key={c.id} className="rounded-lg border px-3 py-2">
            <p className="text-muted-foreground text-xs">
              {c.author} · {when(c.created)}
            </p>
            <p className="text-sm whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) reply.mutate()
        }}
      >
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply" rows={3} />
        <Button type="submit" className="h-12 w-full" disabled={!text.trim() || reply.isPending}>
          Send reply
        </Button>
      </form>
    </BottomSheet>
  )
}

function TaskForm({ agent }: { agent: Agent }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const create = useMutation({
    mutationFn: async () => {
      const res = await fetchClient("/api/team/board", {
        method: "POST",
        body: JSON.stringify({ title, body, assignee: agent.name }),
      })
      if (!res.ok) throw new Error("Could not create the task")
    },
    onSuccess: () => {
      setTitle("")
      setBody("")
      toast({ title: `Task given to ${agent.label}`, status: "success" })
      void queryClient.invalidateQueries({ queryKey: ["team-board"] })
      void queryClient.invalidateQueries({ queryKey: ["team"] })
    },
    onError: () => toast({ title: "Could not create the task", status: "error" }),
  })

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim()) create.mutate()
      }}
    >
      <h3 className="text-sm font-semibold">Give {agent.label} a task</h3>
      <Input className="h-12" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details" rows={3} />
      <Button type="submit" className="h-12 w-full" disabled={!title.trim() || create.isPending}>
        Give task
      </Button>
    </form>
  )
}

type MemoryNode = { id: string; label: string; category: string }

function AgentDetail({
  agent,
  board,
  onClose,
  onOpenCard,
}: {
  agent: Agent | null
  board: Board | undefined
  onClose: () => void
  onOpenCard: (id: string) => void
}) {
  const router = useRouter()
  const { active, switchTo } = useProfiles()
  const { data: memory, isLoading } = useQuery<{ nodes: MemoryNode[] }>({
    queryKey: ["team-memory", agent?.name],
    queryFn: () => getJson(`/api/team/memory?profile=${agent?.name}`),
    enabled: !!agent,
  })

  const cards = Object.values(board?.columns ?? {})
    .flat()
    .filter((c) => c.assignee === agent?.name)
    .sort((a, b) => b.updated - a.updated)
  const groups = new Map<string, MemoryNode[]>()
  for (const n of memory?.nodes ?? []) groups.set(n.category, [...(groups.get(n.category) ?? []), n])

  return (
    <BottomSheet
      open={!!agent}
      onClose={onClose}
      title={agent?.label ?? ""}
      description={agent ? `${agent.role} · ${chip(agent).text}` : undefined}
    >
      {agent ? (
        <>
          <Button
            className="h-12 w-full"
            disabled={agent.name === active}
            onClick={() =>
              void switchTo(agent.name)
                .then(() => router.push("/"))
                .catch(() => toast({ title: "Could not switch persona", status: "error" }))
            }
          >
            {agent.name === active ? `Talking to ${agent.label}` : `Switch to ${agent.label}`}
          </Button>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Cards</h3>
            {cards.length ? (
              cards.slice(0, 15).map((c) => <CardRow key={c.id} card={c} onOpen={onOpenCard} />)
            ) : (
              <p className="text-muted-foreground text-sm">No cards.</p>
            )}
          </section>

          <TaskForm agent={agent} />

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Memory</h3>
            <StatusBlock isLoading={isLoading} isEmpty={!memory?.nodes.length} emptyLabel="No memory entries.">
              {[...groups].map(([category, nodes]) => (
                <div key={category} className="space-y-1">
                  <p className="text-muted-foreground text-xs uppercase">{category}</p>
                  {nodes.map((n) => (
                    <p key={n.id} className="rounded-lg border px-3 py-2 text-sm">
                      {n.label}
                    </p>
                  ))}
                </div>
              ))}
            </StatusBlock>
          </section>
        </>
      ) : null}
    </BottomSheet>
  )
}

export default function TeamPage() {
  const [agentName, setAgentName] = useState<string | null>(null)
  const [cardId, setCardId] = useState<string | null>(null)
  const team = useQuery<{ agents: Agent[] }>({
    queryKey: ["team"],
    queryFn: () => getJson("/api/team"),
    refetchInterval: POLL_MS,
  })
  const board = useQuery<Board>({
    queryKey: ["team-board"],
    queryFn: () => getJson("/api/team/board"),
    refetchInterval: POLL_MS,
  })
  const agents = team.data?.agents ?? []
  const waiting = board.data?.waitingOnYou ?? []

  return (
    <div className="pb-[env(safe-area-inset-bottom)]">
      <PageHeader title="Team" />

      {waiting.length ? (
        <section className="mb-6 space-y-2">
          <h2 className="text-sm font-semibold">
            Waiting on you <Badge variant="secondary">{waiting.length}</Badge>
          </h2>
          {waiting.map((c) => (
            <CardRow key={c.id} card={c} onOpen={setCardId} />
          ))}
        </section>
      ) : null}

      <StatusBlock
        isLoading={team.isLoading}
        error={team.error ? "Could not reach the agents." : null}
        isEmpty={!agents.length}
        emptyLabel="No agents configured."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {agents.map((a) => {
            const c = chip(a)
            return (
              <button
                key={a.name}
                type="button"
                onClick={() => setAgentName(a.name)}
                className="hover:bg-accent flex min-h-12 items-center gap-3 rounded-xl border p-3 text-left"
              >
                <Avatar label={a.label} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.label}</span>
                  <span className="text-muted-foreground block truncate text-sm">
                    {a.role} · {a.counts.open} open
                  </span>
                </span>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", c.cls)}>{c.text}</span>
              </button>
            )
          })}
        </div>
      </StatusBlock>

      <AgentDetail
        agent={agents.find((a) => a.name === agentName) ?? null}
        board={board.data}
        onClose={() => setAgentName(null)}
        onOpenCard={setCardId}
      />
      <CardDetail id={cardId} onClose={() => setCardId(null)} />
    </div>
  )
}
