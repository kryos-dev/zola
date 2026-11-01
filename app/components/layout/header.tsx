"use client"

import { ButtonTheme } from "@/app/components/layout/button-theme"
import { HeaderSidebarTrigger } from "@/app/components/layout/header-sidebar-trigger"
import { PersonaSwitcher } from "@/app/components/layout/persona-switcher"
import { NewConversationButton } from "@/app/components/session/new-conversation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useSidebar } from "@/components/ui/sidebar"
import { APP_NAME } from "@/lib/config"
import { cn } from "@/lib/utils"
import { FolderIcon, UsersThreeIcon } from "@phosphor-icons/react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"

type Session = { projectId: string | null }

export function Header({ hasSidebar }: { hasSidebar: boolean }) {
  const { open } = useSidebar()

  // Shares its cache entry with the settings page and the project page.
  const { data: session } = useQuery<Session>({
    queryKey: ["session"],
    queryFn: async () => {
      const res = await fetch("/api/session")
      if (!res.ok) throw new Error("Failed to load session")
      return res.json()
    },
  })
  const projectId = session?.projectId
  const { data: project } = useQuery<{ id: string; name: string }>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`)
      if (!res.ok) throw new Error("Failed to fetch project")
      return res.json()
    },
    enabled: !!projectId,
  })

  return (
    <header className="h-app-header pointer-events-none fixed top-0 right-0 left-0 z-50">
      <div className="relative mx-auto flex h-full items-center justify-between bg-transparent pl-2 pr-4 sm:pr-6 lg:bg-transparent lg:pr-8">
        <div
          className={cn(
            "pointer-events-auto flex min-w-0 items-center gap-2 transition-[margin]",
            // keep the left group clear of the open desktop sidebar
            hasSidebar && open && "md:ml-(--sidebar-width)"
          )}
        >
          <HeaderSidebarTrigger
            className={cn(hasSidebar && open && "md:hidden")}
          />
          <span className="text-foreground truncate text-sm font-semibold">
            {APP_NAME}
          </span>
          <PersonaSwitcher />
          {project ? (
            <Link href={`/p/${project.id}`} className="min-w-0">
              <Badge variant="secondary" className="max-w-40 gap-1">
                <FolderIcon size={12} className="shrink-0" />
                <span className="truncate">{project.name}</span>
              </Badge>
            </Link>
          ) : null}
        </div>
        <div className="pointer-events-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" className="size-12 md:size-9" aria-label="Team">
            <Link href="/team">
              <UsersThreeIcon className="size-5" />
            </Link>
          </Button>
          <NewConversationButton />
          <ButtonTheme />
        </div>
      </div>
    </header>
  )
}
