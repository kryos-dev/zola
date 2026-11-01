"use client"

import { InstructionsDialog } from "@/app/p/[projectId]/_components/instructions-dialog"
import { DialogDeleteProject } from "@/app/components/layout/sidebar/dialog-delete-project"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { fetchClient } from "@/lib/fetch"
import {
  ArrowLeftIcon,
  CaretDownIcon,
  DotsThreeIcon,
  PencilSimpleIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRef, useState } from "react"

type Project = {
  id: string
  name: string
  description: string | null
  systemPrompt: string | null
  user_id: string
  created_at: string
}

type ProjectViewProps = {
  projectId: string
}

type ProjectFile = {
  id: string
  fileName: string
  fileSize: number | null
  text: string | null
}

// The "files" part of a project: uploaded here, read into every chat's
// system prompt server-side (see lib/projects/context.ts). "not read" means
// the upload was accepted but its text was not extracted (a PDF today), not
// that anything failed.
function formatSize(bytes: number | null): string | null {
  if (!bytes && bytes !== 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ProjectFiles({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [expanded, setExpanded] = useState(false)
  const queryKey = ["projects", projectId, "files"]

  const { data: files = [], isLoading } = useQuery<ProjectFile[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/files`)
      if (!response.ok) throw new Error("Failed to fetch files")
      return response.json()
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append("file", file)
      const response = await fetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        body: form,
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || "Upload failed")
      }
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: Error) => toast({ title: error.message, status: "error" }),
  })

  const removeMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(
        `/api/projects/${projectId}/files?fileId=${fileId}`,
        { method: "DELETE" }
      )
      if (!response.ok) throw new Error("Failed to remove file")
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => toast({ title: "Failed to remove file", status: "error" }),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Files</CardTitle>
        <CardAction>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) uploadMutation.mutate(file)
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label="Upload file"
            onClick={() => inputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            <PlusIcon size={16} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : files.length > 0 ? (
          <div className="space-y-2">
            {(expanded ? files : files.slice(0, PREVIEW_ROWS)).map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 rounded-md border px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{file.fileName}</p>
                  {formatSize(file.fileSize) ? (
                    <p className="text-muted-foreground text-xs">
                      {formatSize(file.fileSize)}
                    </p>
                  ) : null}
                </div>
                {file.text === null ? (
                  <Badge variant="secondary" className="text-muted-foreground shrink-0">
                    not read
                  </Badge>
                ) : null}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${file.fileName}`}
                  onClick={() => removeMutation.mutate(file.id)}
                  disabled={removeMutation.isPending}
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
            ))}
            <ShowMore
              hidden={files.length - PREVIEW_ROWS}
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

// Every list on this page is long and none of it is the point of the page:
// five rows, then a line that says how many are hidden. One component so the
// three lists cannot drift apart.
const PREVIEW_ROWS = 5

function ShowMore({
  hidden,
  expanded,
  onToggle,
}: {
  hidden: number
  expanded: boolean
  onToggle: () => void
}) {
  if (hidden <= 0) return null
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground w-full justify-start"
      onClick={onToggle}
    >
      {expanded ? "Show less" : `Show ${hidden} more`}
    </Button>
  )
}

export function ProjectView({ projectId }: ProjectViewProps) {
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`)
      if (!response.ok) {
        throw new Error("Failed to fetch project")
      }
      return response.json()
    },
  })

  // The project whose instructions apply to the one rolling conversation.
  const { data: session } = useQuery<{ projectId: string | null }>({
    queryKey: ["session"],
    queryFn: async () => {
      const response = await fetch("/api/session")
      if (!response.ok) throw new Error("Failed to load session")
      return response.json()
    },
  })
  const active = session?.projectId === projectId

  const setActive = useMutation({
    mutationFn: async (next: string | null) => {
      const response = await fetchClient("/api/session/project", {
        method: "PATCH",
        body: JSON.stringify({ projectId: next }),
      })
      if (!response.ok) throw new Error("Failed to update the active project")
    },
    onSuccess: (_data, next) => {
      void queryClient.invalidateQueries({ queryKey: ["session"] })
      toast({
        title: next ? "Using this project from your next message" : "Project cleared",
        status: "success",
      })
    },
    onError: (error: Error) => toast({ title: error.message, status: "error" }),
  })

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-app-header md:pt-8">
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
            <Link href="/projects">
              <ArrowLeftIcon size={14} />
              All projects
            </Link>
          </Button>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {project ? (
                <h1 className="truncate text-2xl font-semibold">{project.name}</h1>
              ) : (
                <Skeleton className="h-8 w-48" />
              )}
              {project?.description ? (
                <p className="text-muted-foreground text-sm">{project.description}</p>
              ) : null}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Project actions">
                  <DotsThreeIcon size={18} weight="bold" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setInstructionsOpen(true)}>
                  Edit instructions
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/projects">Rename project</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleteOpen(true)}
                >
                  Delete project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              disabled={!session || setActive.isPending}
              variant={active ? "secondary" : "default"}
              onClick={() => setActive.mutate(active ? null : projectId)}
            >
              {active ? "Stop using this project" : "Use this project"}
            </Button>
            {active ? <Badge variant="secondary">In use</Badge> : null}
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            The project&apos;s instructions and files are added to the conversation
            from your next message.{" "}
            <Link href="/" className="underline">
              Back to the conversation
            </Link>
          </p>
        </div>
      </div>

      {/* Right rail: instructions, files. Stacks after main on mobile
          behind a "Project details" toggle, collapsed by default so the cards
          don't push the composer off screen; its own always-open column with
          its own scroll from lg. No media-query hook: the trigger hides and
          CSS shows the content from lg regardless of open state. */}
      <Collapsible className="w-full shrink-0 border-t lg:h-full lg:w-80 lg:overflow-y-auto lg:border-t-0 lg:border-l">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between px-4 lg:hidden [&[data-state=open]>svg]:rotate-180"
          >
            Project details
            <CaretDownIcon size={16} className="transition-transform" />
          </Button>
        </CollapsibleTrigger>
        {/* forceMount keeps the cards in the DOM while closed so lg: can show
            them without the toggle ever being opened. */}
        <CollapsibleContent
          forceMount
          className="hidden flex-col gap-4 p-4 data-[state=open]:flex lg:flex lg:pt-8"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Instructions</CardTitle>
              <CardAction>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Edit instructions"
                  onClick={() => setInstructionsOpen(true)}
                >
                  <PencilSimpleIcon size={16} />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {project ? (
                <p className="text-muted-foreground line-clamp-6 text-sm whitespace-pre-wrap">
                  {project.systemPrompt || "No instructions yet."}
                </p>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
            </CardContent>
          </Card>

          <ProjectFiles projectId={projectId} />

        </CollapsibleContent>
      </Collapsible>

      <InstructionsDialog
        projectId={projectId}
        systemPrompt={project?.systemPrompt ?? null}
        open={instructionsOpen}
        onOpenChange={setInstructionsOpen}
      />

      {project ? (
        <DialogDeleteProject
          isOpen={deleteOpen}
          setIsOpen={setDeleteOpen}
          project={{ id: project.id, name: project.name }}
        />
      ) : null}
    </div>
  )
}
