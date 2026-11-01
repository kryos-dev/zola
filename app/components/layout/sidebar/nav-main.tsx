"use client"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useUser } from "@/lib/user-store/provider"
import {
  ClockCounterClockwiseIcon,
  FolderIcon,
  GearIcon,
  ImagesIcon,
  NotePencilIcon,
  PlugsConnectedIcon,
  PuzzlePieceIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

// Claude's order: Projects, Settings, Customize (skills + connectors on one page),
// Scheduled.
//
// The admin ones drive the agent for everyone on the box -- its skills, its
// connectors, its cron jobs -- so their APIs answer 403 to anyone who is not
// the operator. Leaving the links up would just be pages of error text for a
// guest; hiding them is presentation, not the check.
const NAV_ITEMS = [
  { href: "/projects", label: "Projects", icon: FolderIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
  // The image library (apps/menaka) is its own app on its own host; the
  // sidebar is where people look for it.
  { href: "https://menaka.kryos.dev", label: "Images", icon: ImagesIcon },
  {
    href: "/customize",
    label: "Customize",
    icon: PuzzlePieceIcon,
    admin: true,
  },
  {
    href: "/scheduled",
    label: "Scheduled",
    icon: ClockCounterClockwiseIcon,
    admin: true,
  },
  {
    href: "/providers",
    label: "Providers",
    icon: PlugsConnectedIcon,
    admin: true,
  },
]

export function NavMain() {
  const pathname = usePathname()
  const { user } = useUser()

  return (
    <SidebarMenu className="mb-3 gap-0.5">
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={pathname === "/"}
          tooltip="Conversation"
        >
          <Link href="/" prefetch>
            <NotePencilIcon size={16} />
            <span>Conversation</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {NAV_ITEMS.filter((item) => !item.admin || user?.is_admin).map((item) => {
        const isActive = pathname?.startsWith(item.href)
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
              <Link href={item.href} prefetch>
                <item.icon size={16} />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
