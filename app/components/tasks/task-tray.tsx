"use client"

import { MessageAssistant } from "@/app/components/chat/message-assistant"
import { PersonaAvatar } from "@/app/components/layout/persona-switcher"
import { useProfiles } from "@/app/hooks/use-profiles"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { fetchClient } from "@/lib/fetch"
import {
  TASK_STATE_LABEL,
  isActiveState,
  pendingApproval,
  stateFromEvents,
  taskState,
  type TaskState,
} from "@/lib/tasks"
import { cn } from "@/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeftIcon, ListChecksIcon, SendHorizontalIcon, SquareIcon } from "lucide-react"
import { useState } from "react"
import { useRunFeed } from "./use-run-feed"
import { useTasks, type Task } from "./use-tasks"

const STATE_STYLE: Record<TaskState, string> = {
  working: "bg-primary/15 text-primary",
  "needs-input": "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  idle: "bg-muted text-muted-foreground",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/15 text-destructive",
  stopped: "bg-muted text-muted-foreground",
}

function StateChip({ state }: { state: TaskState }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        STATE_STYLE[state]
      )}
    >
      {TASK_STATE_LABEL[state]}
    </span>
  )
}

async function control(runId: string, action: "steer" | "stop" | "approval", body: object) {
  const res = await fetchClient(`/api/tasks/${encodeURIComponent(runId)}/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const msg = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)
      ?.error?.message
    toast({ title: msg || `Could not ${action} the task`, status: "error" })
  }
  return res.ok
}

const act = "min-h-12 rounded-xl px-4 text-sm"

function TaskDetail({ task, onBack }: { task: Task; onBack: () => void }) {
  const { refresh } = useTasks()
  const feed = useRunFeed(task.runId)
  const [steer, setSteer] = useState("")

  const live = stateFromEvents(feed.events)
  const listed = taskState(task.status)
  const state = !isActiveState(listed) ? listed : (live ?? listed)
  const approval = state === "needs-input" ? pendingApproval(feed.events) : null

  // After the backlog window, or when Hermes dropped the stream, the run
  // status (GET /v1/runs/{id}) still carries the final output.
  const needStatus = feed.truncated || feed.unavailable || (feed.done && !feed.message)
  const { data: status } = useQuery<{ output: string | null; error: unknown }>({
    queryKey: ["task", task.runId, state],
    queryFn: async () => (await fetch(`/api/tasks/${encodeURIComponent(task.runId)}`)).json(),
    enabled: needStatus,
  })

  const run = async (action: "steer" | "stop" | "approval", body: object) => {
    if (await control(task.runId, action, body)) refresh()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-2 pb-2">
        <Button variant="ghost" size="icon" className="size-12" onClick={onBack} aria-label="Back to tasks">
          <ArrowLeftIcon className="size-5" />
        </Button>
        <DrawerTitle className="min-w-0 flex-1 truncate text-base">{task.title}</DrawerTitle>
        <StateChip state={state} />
      </div>
      <DrawerDescription className="sr-only">Live activity of the task</DrawerDescription>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {feed.truncated ? (
          <p className="text-muted-foreground mb-2 text-xs">Earlier activity is no longer available.</p>
        ) : null}
        {feed.message ? (
          <MessageAssistant
            id={feed.message.id}
            parts={feed.message.parts}
            streaming={state === "working"}
          />
        ) : !needStatus ? (
          <p className="text-muted-foreground text-sm">Waiting for activity…</p>
        ) : null}
        {needStatus && status?.output && !feed.message ? (
          <p className="text-sm whitespace-pre-wrap">{status.output}</p>
        ) : null}
        {state === "failed" && status?.error ? (
          <p className="text-destructive mt-2 text-sm">{String(status.error)}</p>
        ) : null}
      </div>

      {approval ? (
        <div className="border-border bg-amber-500/10 mx-4 mb-2 rounded-xl border p-3">
          <p className="text-sm font-medium">Approval needed</p>
          {approval.description ? <p className="text-muted-foreground mt-1 text-sm">{approval.description}</p> : null}
          {approval.command ? (
            <pre className="bg-muted mt-2 max-h-32 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
              {approval.command}
            </pre>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button
              className={cn(act, "flex-1")}
              onClick={() =>
                run("approval", { choice: "once", ...(approval.requestId ? { request_id: approval.requestId } : {}) })
              }
            >
              Approve
            </Button>
            <Button
              variant="outline"
              className={cn(act, "flex-1")}
              onClick={() =>
                run("approval", { choice: "deny", ...(approval.requestId ? { request_id: approval.requestId } : {}) })
              }
            >
              Deny
            </Button>
          </div>
        </div>
      ) : null}

      {isActiveState(state) ? (
        <form
          className="flex items-center gap-2 px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]"
          onSubmit={async (e) => {
            e.preventDefault()
            const text = steer.trim()
            if (text && (await control(task.runId, "steer", { text }))) setSteer("")
          }}
        >
          <Input
            value={steer}
            onChange={(e) => setSteer(e.target.value)}
            placeholder="Steer the task…"
            className="h-12 flex-1 text-base"
            aria-label="Steer the task"
          />
          <Button type="submit" size="icon" className="size-12" disabled={!steer.trim()} aria-label="Send guidance">
            <SendHorizontalIcon className="size-5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-12"
            onClick={() => run("stop", {})}
            aria-label="Stop the task"
          >
            <SquareIcon className="size-5" />
          </Button>
        </form>
      ) : (
        <div className="pb-[env(safe-area-inset-bottom)]" />
      )}
    </div>
  )
}

function TaskList({ onOpen }: { onOpen: (t: Task) => void }) {
  const { tasks } = useTasks()
  const { profiles } = useProfiles()
  if (!tasks.length) {
    return (
      <p className="text-muted-foreground px-6 py-8 text-center text-sm">
        No tasks yet. Start one from the chat box with <code>/task</code> followed by the job.
      </p>
    )
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
      {tasks.map((t) => {
        const label = profiles.find((p) => p.name === t.profile)?.label ?? t.profile
        return (
          <li key={t.runId}>
            <button
              type="button"
              onClick={() => onOpen(t)}
              className="hover:bg-muted flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
            >
              <PersonaAvatar label={label} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="text-muted-foreground block truncate text-xs">{label}</span>
              </span>
              <StateChip state={taskState(t.status)} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Header button with a badge for working and needs-input tasks, opening the task sheet. */
export function TaskTray() {
  const { attention, tasks } = useTasks()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const task = tasks.find((t) => t.runId === selected)

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setSelected(null)
      }}
    >
      <DrawerTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-12 md:size-9" aria-label={`Tasks${attention ? `, ${attention} active` : ""}`}>
          <ListChecksIcon className="size-5" />
          {attention ? (
            <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold md:top-0 md:right-0">
              {attention}
            </span>
          ) : null}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="h-[85dvh] max-h-[85dvh]">
        {task ? (
          <TaskDetail task={task} onBack={() => setSelected(null)} />
        ) : (
          <>
            <div className="px-4 pt-2 pb-2">
              <DrawerTitle>Tasks</DrawerTitle>
              <DrawerDescription className="sr-only">Background tasks and their state</DrawerDescription>
            </div>
            <TaskList onOpen={(t) => setSelected(t.runId)} />
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
