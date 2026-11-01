"use client"

import { fetchClient } from "@/lib/fetch"
import { isActiveState, taskState, type TaskState } from "@/lib/tasks"
import { useQuery, useQueryClient } from "@tanstack/react-query"

export type Task = {
  runId: string
  profile: string
  title: string
  status: string
  createdAt: string
}

const KEY = ["tasks"]

/** The user's background tasks (Hermes detached runs) and how many need attention. */
export function useTasks() {
  const queryClient = useQueryClient()
  const { data } = useQuery<Task[]>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch("/api/tasks")
      if (!res.ok) throw new Error("Failed to load tasks")
      return ((await res.json()) as { tasks: Task[] }).tasks
    },
    // Poll while anything is unfinished; focus refetch covers the rest.
    refetchInterval: (q) =>
      q.state.data?.some((t) => isActiveState(taskState(t.status))) ? 4000 : false,
  })
  const tasks = data ?? []
  const attention = tasks.filter((t) => isActiveState(taskState(t.status))).length
  return {
    tasks,
    attention,
    refresh: () => queryClient.invalidateQueries({ queryKey: KEY }),
  }
}

/** Starts a task; throws when Hermes or the server refuses it. */
export async function startTask(text: string): Promise<void> {
  const res = await fetchClient("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error("Could not start the task")
}

export type { TaskState }
