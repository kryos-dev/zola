"use client"

import { ChatView } from "@/app/components/chat/chat-view"
import { fetchHistory } from "@/lib/history-client"
import { useQuery } from "@tanstack/react-query"

// The one rolling conversation: the transcript is Hermes' session, loaded from
// /api/history; there is no chat id.
export function Chat() {
  const { data: history, isError } = useQuery({
    queryKey: ["history"],
    queryFn: () => fetchHistory(),
    // Fetched once per mount and never kept: a revisit must not seed the chat
    // with an old list.
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  if (!history && isError) {
    return <p className="text-muted-foreground m-auto text-sm">Could not load the conversation.</p>
  }

  // Undefined while loading; the view shows its skeleton with the composer
  // disabled and is replaced by one seeded with the rows.
  const rows = history?.messages
  const pending = history?.pending ?? false
  return (
    <ChatView
      // Remounts when the loaded rows change (first load, or a refetch after a
      // reattach found nothing to resume), which re-seeds useChat from them.
      key={rows ? `${rows.length}:${rows.at(-1)?.id}:${pending}` : "loading"}
      history={rows}
      pending={pending}
    />
  )
}
