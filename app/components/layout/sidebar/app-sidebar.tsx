"use client"

import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { ZolaIcon } from "@/components/icons/zola"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { APP_NAME } from "@/lib/config"
import { signOutUser } from "@/lib/user-store/api"
import { useUser } from "@/lib/user-store/provider"
import {
  DotsThreeIcon,
  FolderIcon,
  PlusIcon,
  SidebarSimpleIcon,
  SignOut,
  X,
} from "@phosphor-icons/react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useParams } from "next/navigation"
import { NavMain } from "./nav-main"

// Same shape and query as the Projects page (app/(cloud9)/projects/page.tsx)
// so both share one react-query cache entry instead of two fetches.
type Project = { id: string; name: string }

const SIDEBAR_PROJECTS_LIMIT = 5

export function AppSidebar() {
  const isMobile = useBreakpoint(768)
  const { setOpenMobile, toggleSidebar } = useSidebar()
  const { user } = useUser()
  const params = useParams<{ projectId?: string }>()

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects")
      if (!res.ok) throw new Error("Failed to load projects")
      return res.json()
    },
  })

  const scopeProjectId = params.projectId ?? null

  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader className="h-14 pl-3">
        <div className="flex h-full items-center justify-between pr-1">
          <span className="text-foreground flex min-w-0 items-center gap-2 p-1 text-sm font-semibold">
            <ZolaIcon className="size-4 shrink-0" />
            <span className="truncate">{APP_NAME}</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8"
            onClick={isMobile ? () => setOpenMobile(false) : toggleSidebar}
            aria-label={isMobile ? "Close sidebar" : "Toggle sidebar"}
          >
            {isMobile ? <X size={18} /> : <SidebarSimpleIcon size={18} />}
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="flex h-full px-2 [&>div>div]:!block">
          <NavMain />

          <SidebarGroup className="p-0">
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <SidebarGroupAction asChild title="New project">
              <Link href="/projects?new=1" aria-label="New project">
                <PlusIcon />
              </Link>
            </SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu>
                {projects.slice(0, SIDEBAR_PROJECTS_LIMIT).map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={project.id === scopeProjectId}
                    >
                      <Link href={`/p/${project.id}`}>
                        <FolderIcon size={16} />
                        <span className="truncate">{project.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {projects.length === 0 && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className="text-muted-foreground"
                    >
                      <Link href="/projects">
                        <PlusIcon size={16} />
                        <span>New project</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {projects.length > SIDEBAR_PROJECTS_LIMIT && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className="text-muted-foreground"
                    >
                      <Link href="/projects">
                        <DotsThreeIcon size={16} weight="bold" />
                        <span>All projects</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>

      {/* No menu behind the avatar: the dropdown version misbehaved and the
          a single plain logout button replaces it.
          No settings gear: Settings is gone, its Models tab and agent
          instructions live on Customize and Usage has its own page. */}
      <SidebarFooter className="flex-row items-center gap-1 p-2">
        <Avatar className="size-6 shrink-0">
          <AvatarImage src={user?.profile_image ?? undefined} />
          <AvatarFallback>{user?.display_name?.charAt(0)}</AvatarFallback>
        </Avatar>
        <span className="text-foreground min-w-0 flex-1 truncate px-1 text-sm font-medium">
          {user?.display_name}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-8"
          aria-label="Log out"
          onClick={() => signOutUser()}
        >
          <SignOut size={18} />
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
