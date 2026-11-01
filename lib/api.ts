import type { UserProfile } from "@/lib/user/types"

export class UsageLimitError extends Error {
  code: string
  constructor(message: string) {
    super(message)
    this.code = "DAILY_LIMIT_REACHED"
  }
}

/**
 * Single-user app: there is no guest identity to create anymore. Kept as a
 * thin shim (rather than editing every call site) so `useUser()`'s real
 * user id flows through unchanged.
 */
export const getOrCreateGuestUserId = async (
  user: UserProfile | null
): Promise<string | null> => user?.id ?? null
