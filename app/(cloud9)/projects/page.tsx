"use client"

// Claude-style projects list: search + sort over a card grid.

import { formatDate } from "@/lib/format-date"
import { DialogDeleteProject } from "@/app/components/layout/sidebar/dialog-delete-project"
import { InstructionsDialog } from "@/app/p/[projectId]/_components/instructions-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { fetchClient } from "@/lib/fetch"
import {
  DotsThreeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useState } from "react"

type Project = {
  id: string
  name: string
  description: string | null
  systemPrompt: string | null
  userId: string
  createdAt: string
  updatedAt: string | null
}

// The API answers failures as { error }; surface that instead of a generic
// line, so a server-side failure is never a dialog that silently does nothing.
async function failure(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => null)
  return new Error(body?.error || fallback)
}

function toastError(title: string) {
  return (err: Error) =>
    toast({ title, description: err.message, status: "error" })
}

type SortKey = "activity" | "name" | "created"
const SORT_LABEL: Record<SortKey, string> = {
  activity: "Activity",
  name: "Name",
  created: "Created",
}

function sortProjects(projects: Project[], sortBy: SortKey): Project[] {
  const sorted = [...projects]
  if (sortBy === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name))
  } else if (sortBy === "created") {
    sorted.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  } else {
    sorted.sort((a, b) => {
      const aTime = new Date(a.updatedAt ?? a.createdAt).getTime()
      const bTime = new Date(b.updatedAt ?? b.createdAt).getTime()
      return bTime - aTime
    })
  }
  return sorted
}

function ProjectsPageEnabled() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<SortKey>("activity")
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  // /projects?new=1 opens the create dialog, so a "New project" link elsewhere
  // (the sidebar) lands on the form instead of on the list.
  useEffect(() => {
    if (searchParams.get("new") === "1") setIsCreateOpen(true)
  }, [searchParams])
  const setCreateOpen = (open: boolean) => {
    setIsCreateOpen(open)
    if (!open && searchParams.get("new")) router.replace("/projects", { scroll: false })
  }
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [editingDetails, setEditingDetails] = useState<{
    id: string
    name: string
    description: string
  } | null>(null)
  const [instructionsFor, setInstructionsFor] = useState<Project | null>(null)

  const { data: projects, isLoading, error } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects")
      if (!res.ok) throw await failure(res, "Failed to load projects")
      return res.json()
    },
  })

  const visibleProjects = useMemo(() => {
    const filtered = (projects ?? []).filter((project) =>
      project.name.toLowerCase().includes(search.trim().toLowerCase())
    )
    return sortProjects(filtered, sortBy)
  }, [projects, search, sortBy])

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await fetchClient("/api/projects", {
        method: "POST",
        body: JSON.stringify(data),
      })
      if (!res.ok) throw await failure(res, "Failed to create project")
      return res.json() as Promise<Project>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      setCreateOpen(false)
    },
    onError: toastError("Could not create project"),
  })

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetchClient(`/api/projects/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw await failure(res, "Failed to rename project")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      setRenaming(null)
    },
    onError: toastError("Could not rename project"),
  })

  const detailsMutation = useMutation({
    mutationFn: async (data: {
      id: string
      name: string
      description: string
    }) => {
      const res = await fetchClient(`/api/projects/${data.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: data.name,
          description: data.description,
        }),
      })
      if (!res.ok) throw await failure(res, "Failed to save project details")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      setEditingDetails(null)
    },
    onError: toastError("Could not save project details"),
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon size={16} weight="bold" />
          New project
        </Button>
      </div>

      <div className="relative mb-3">
        <MagnifyingGlassIcon
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects"
          className="pl-9"
        />
      </div>

      <div className="mb-6 flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Sort by {SORT_LABEL[sortBy]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <DropdownMenuItem key={key} onSelect={() => setSortBy(key)}>
                {SORT_LABEL[key]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading projects...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : visibleProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {projects?.length === 0
              ? "No projects yet. Create one to group related chats."
              : "No projects match your search."}
          </p>
          {projects?.length === 0 && (
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon size={16} weight="bold" />
              New project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleProjects.map((project) => (
            <Link key={project.id} href={`/p/${project.id}`} className="block">
              <Card className="h-full transition-colors hover:bg-accent/30">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-base font-medium">
                      {project.name}
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="-mt-1 -mr-1 shrink-0"
                          aria-label={`Actions for ${project.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                          }}
                        >
                          <DotsThreeIcon size={18} weight="bold" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                        }}
                      >
                        <DropdownMenuItem
                          onSelect={() => setRenaming({ id: project.id, name: project.name })}
                        >
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setInstructionsFor(project)}>
                          Instructions
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            setEditingDetails({
                              id: project.id,
                              name: project.name,
                              description: project.description ?? "",
                            })
                          }
                        >
                          Edit details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => setDeleteTarget(project)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {project.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  ) : null}

                  <div className="mt-2 flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground">
                      Updated {formatDate(project.updatedAt ?? project.createdAt)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Rename uses a dialog rather than an inline row. */}
      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          {renaming && (
            <Input
              autoFocus
              value={renaming.name}
              onChange={(e) => setRenaming({ id: renaming.id, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") renameMutation.mutate(renaming)
              }}
            />
          )}
          <DialogFooter>
            <Button
              disabled={renameMutation.isPending}
              onClick={() => renaming && renameMutation.mutate(renaming)}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {instructionsFor && (
        <InstructionsDialog
          projectId={instructionsFor.id}
          systemPrompt={instructionsFor.systemPrompt}
          open={!!instructionsFor}
          onOpenChange={(open) => !open && setInstructionsFor(null)}
        />
      )}

      <Dialog
        open={!!editingDetails}
        onOpenChange={(open) => !open && setEditingDetails(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit project details</DialogTitle>
          </DialogHeader>
          {editingDetails && (
            <div className="flex flex-col gap-3">
              <Input
                autoFocus
                placeholder="Name"
                value={editingDetails.name}
                onChange={(e) =>
                  setEditingDetails({ ...editingDetails, name: e.target.value })
                }
              />
              <Textarea
                rows={3}
                placeholder="Description"
                value={editingDetails.description}
                onChange={(e) =>
                  setEditingDetails({ ...editingDetails, description: e.target.value })
                }
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingDetails(null)}>
              Cancel
            </Button>
            <Button
              disabled={detailsMutation.isPending || !editingDetails?.name.trim()}
              onClick={() => editingDetails && detailsMutation.mutate(editingDetails)}
            >
              {detailsMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setCreateOpen}>
        <NewProjectForm
          onCreate={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
        />
      </Dialog>

      {deleteTarget && (
        <DialogDeleteProject
          isOpen={!!deleteTarget}
          setIsOpen={(open) => !open && setDeleteTarget(null)}
          project={deleteTarget}
        />
      )}
    </div>
  )
}

function NewProjectForm({
  onCreate,
  isPending,
  onCancel,
}: {
  onCreate: (data: { name: string; description: string }) => void
  isPending: boolean
  onCancel: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>New project</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <Input
          autoFocus
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim() && !isPending) {
              onCreate({ name: name.trim(), description })
            }
          }}
        />
        <Textarea
          rows={3}
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!name.trim() || isPending}
          onClick={() => onCreate({ name: name.trim(), description })}
        >
          {isPending ? "Creating..." : "Create project"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

export default function ProjectsPage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense>
      <ProjectsPageEnabled />
    </Suspense>
  )
}
