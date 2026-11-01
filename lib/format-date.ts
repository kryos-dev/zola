// Format date in a human-readable way
export function formatDate(dateString?: string | null): string {
  if (!dateString) return "No date"

  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  // Less than 1 hour: show minutes
  if (diffMinutes < 60) {
    if (diffMinutes < 1) return "Just now"
    return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`
  }

  // Less than 24 hours: show hours
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`
  }

  // Less than 7 days: show days
  if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`
  }

  // Same year: show month and day
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric" })
  }

  // Different year: show month, day and year
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}
