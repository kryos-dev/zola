"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { fetchClient } from "@/lib/fetch"
import { cn } from "@/lib/utils"
import { NotePencilIcon } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"

/** Header / settings button: confirm, start a fresh Hermes session, reload the transcript. */
export function NewConversationButton({
  className,
  label = false,
}: {
  className?: string
  /** Always show the text; otherwise it shows from the sm breakpoint up. */
  label?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()

  const start = async () => {
    setBusy(true)
    try {
      const res = await fetchClient("/api/session/new", { method: "POST" })
      if (!res.ok) throw new Error("failed")
      await queryClient.invalidateQueries({ queryKey: ["history"] })
      void queryClient.invalidateQueries({ queryKey: ["session"] })
      setOpen(false)
      if (pathname !== "/") router.push("/")
    } catch {
      toast({ title: "Could not start a new conversation", status: "error" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn("text-muted-foreground", className)}
        onClick={() => setOpen(true)}
        aria-label="New conversation"
      >
        <NotePencilIcon size={18} />
        <span className={label ? "" : "hidden sm:inline"}>New conversation</span>
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Starts a fresh transcript. Memory is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void start()
              }}
            >
              {busy ? "Starting…" : "Start"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
