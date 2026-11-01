"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/toast"
import { useProfiles } from "@/app/hooks/use-profiles"
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react"

export function PersonaAvatar({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span
      className={`bg-primary text-primary-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${className}`}
      aria-hidden
    >
      {label.charAt(0).toUpperCase()}
    </span>
  )
}

// Header dropdown: which persona (Hermes profile) the conversation is with.
export function PersonaSwitcher() {
  const { profiles, active, switchTo } = useProfiles()
  const current = profiles.find((p) => p.name === active)
  if (!current) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-36 gap-1.5 px-2" aria-label="Switch persona">
          <PersonaAvatar label={current.label} />
          <span className="truncate text-sm">{current.label}</span>
          <CaretDownIcon className="size-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {profiles.map((p) => (
          <DropdownMenuItem
            key={p.name}
            onSelect={() =>
              p.name !== active &&
              void switchTo(p.name).catch(() =>
                toast({ title: "Could not switch persona", status: "error" })
              )
            }
          >
            <PersonaAvatar label={p.label} />
            <span className="flex-1 truncate">{p.label}</span>
            {p.name === active ? <CheckIcon className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
