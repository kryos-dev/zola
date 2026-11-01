"use client"

import { NewConversationButton } from "@/app/components/session/new-conversation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useQuery } from "@tanstack/react-query"

type Session = {
  sessionKey: string
  sessionId: string
  startedAt: string | null
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-muted-foreground w-32 shrink-0 text-sm">{label}</dt>
      <dd className="min-w-0 font-mono text-sm break-all">
        {value === undefined ? <Skeleton className="h-4 w-48" /> : value || "-"}
      </dd>
    </div>
  )
}

export default function SettingsPage() {
  const { data: session } = useQuery<Session>({
    queryKey: ["session"],
    queryFn: async () => {
      const res = await fetch("/api/session")
      if (!res.ok) throw new Error("Failed to load session")
      return res.json()
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Memory and session</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            There is one conversation. The session key scopes the agent&apos;s memory to you
            and survives a new conversation; the session is the current transcript.
          </p>
          <dl className="flex flex-col gap-3">
            <Row label="Session key" value={session?.sessionKey} />
            <Row label="Session id" value={session?.sessionId} />
            <Row
              label="Started"
              value={
                session
                  ? session.startedAt
                    ? new Date(session.startedAt).toLocaleString()
                    : null
                  : undefined
              }
            />
          </dl>
          <div>
            <NewConversationButton label className="border" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
