"use client"

import type { History } from "@/lib/history-client"
import { fetchClient } from "@/lib/fetch"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export type Persona = { name: string; label: string }
type Profiles = { profiles: Persona[]; active: string }

/** The personas (Hermes profiles) and a switch that re-seeds the chat on the new persona's session. */
export function useProfiles() {
  const queryClient = useQueryClient()
  const { data } = useQuery<Profiles>({
    queryKey: ["profiles"],
    queryFn: async () => {
      const res = await fetch("/api/profiles")
      if (!res.ok) throw new Error("Failed to load profiles")
      return res.json()
    },
  })
  const { mutateAsync } = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetchClient("/api/profiles/active", {
        method: "POST",
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error("Could not switch persona")
      return (await res.json()) as { active: string; history: History }
    },
    onSuccess: ({ active, history }) => {
      queryClient.setQueryData<Profiles>(["profiles"], (p) => p && { ...p, active })
      // The Chat wrapper remounts on the new rows.
      queryClient.setQueryData(["history"], history)
      void queryClient.invalidateQueries({ queryKey: ["session"] })
    },
  })
  return { profiles: data?.profiles ?? [], active: data?.active, switchTo: mutateAsync }
}
