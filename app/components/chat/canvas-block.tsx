"use client"

import { useWorkspace } from "@/app/components/workspace/workspace-provider"
import {
  Artifact,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact"
import { FileTextIcon } from "lucide-react"
import { useEffect, useRef } from "react"

type UpsertedCanvas = { id: string; title: string; content: string }

// How often a still-streaming document is pushed into the open canvas tab.
const LIVE_PUSH_MS = 300

// Renders a ```canvas fenced block (see lib/canvas/prompt.ts) as a compact
// document card. A block written in this session opens the canvas pane as soon
// as it starts streaming (once: closing the pane is respected), follows the
// text into the pane while it streams, and is saved when the reply ends.
export function CanvasBlock({
  title,
  content,
  complete,
  streaming,
}: {
  title: string
  content: string
  complete: boolean
  /** True while the parent assistant message is still streaming. */
  streaming: boolean
}) {
  const { openCanvas, updateCanvasContent } = useWorkspace()
  const canvasRef = useRef<Promise<UpsertedCanvas | null> | null>(null)
  // True only for a block seen streaming in this session; a reloaded chat
  // renders its cards without popping the pane open or rewriting the row.
  const liveRef = useRef(false)
  const savedRef = useRef(false)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ title, content })
  latest.current = { title, content }

  // ponytail: "the user's canvas" = most recently updated row for this user
  // (see route comment); a per-turn canvasId thread would be more precise if
  // multiple canvases becomes a real use case.
  const resolveCanvas = () => {
    canvasRef.current ??= (async () => {
      try {
        const listRes = await fetch("/api/cloud9/canvas")
        const existing = listRes.ok ? ((await listRes.json()) as UpsertedCanvas[]) : []
        if (existing[0]) return existing[0]
        const res = await fetch("/api/cloud9/canvas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(latest.current),
        })
        return res.ok ? ((await res.json()) as UpsertedCanvas) : null
      } catch {
        return null
      }
    })().then((canvas) => {
      if (!canvas) canvasRef.current = null // let a later call retry
      return canvas
    })
    return canvasRef.current
  }

  // Open the pane the moment the block starts streaming.
  useEffect(() => {
    if (!streaming || liveRef.current) return
    liveRef.current = true
    void resolveCanvas().then((canvas) => {
      if (canvas) openCanvas(canvas.id, latest.current.title, latest.current.content)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming])

  // Follow the streaming text into the tab. updateCanvasContent is a no-op
  // once the user closed the tab, so this never reopens it.
  useEffect(() => {
    if (!liveRef.current || pushTimer.current) return
    pushTimer.current = setTimeout(() => {
      pushTimer.current = null
      void canvasRef.current?.then((canvas) => {
        if (canvas) updateCanvasContent(canvas.id, latest.current.content, latest.current.title)
      })
    }, LIVE_PUSH_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title])
  useEffect(() => () => {
    if (pushTimer.current) clearTimeout(pushTimer.current)
  }, [])

  // Persist the finished document once the reply is done.
  useEffect(() => {
    if (!complete || streaming || !liveRef.current || savedRef.current) return
    savedRef.current = true
    void resolveCanvas().then(async (canvas) => {
      if (!canvas) return
      const { title: t, content: c } = latest.current
      await fetch(`/api/cloud9/canvas/${canvas.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, content: c }),
      }).catch(() => {})
      updateCanvasContent(canvas.id, c, t)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, streaming])

  const open = () => {
    void resolveCanvas().then((canvas) => {
      if (!canvas) return
      if (liveRef.current) openCanvas(canvas.id, latest.current.title, latest.current.content)
      else openCanvas(canvas.id, canvas.title, canvas.content)
    })
  }

  return (
    <Artifact
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      className="w-full max-w-sm cursor-pointer transition-colors hover:bg-muted/40"
    >
      <ArtifactHeader className="border-b-0 py-2.5">
        <div className="flex items-center gap-2.5">
          <FileTextIcon className="text-muted-foreground size-5 shrink-0" />
          <div className="flex flex-col">
            <ArtifactTitle>{title || "Untitled"}</ArtifactTitle>
            <ArtifactDescription>
              {complete ? "Document" : "Writing…"}
            </ArtifactDescription>
          </div>
        </div>
      </ArtifactHeader>
    </Artifact>
  )
}
