import { useCallback, useState } from "react"

// One rolling conversation, so one draft.
const storageKey = "chat-draft"

export function useChatDraft() {
  const [draftValue, setDraftValueState] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    return localStorage.getItem(storageKey) || ""
  })

  const setDraftValue = useCallback(
    (value: string) => {
      setDraftValueState(value)

      if (typeof window !== "undefined") {
        if (value) {
          localStorage.setItem(storageKey, value)
        } else {
          localStorage.removeItem(storageKey)
        }
      }
    },
    []
  )

  const clearDraft = useCallback(() => {
    setDraftValueState("")
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey)
    }
  }, [])

  return {
    draftValue,
    setDraftValue,
    clearDraft,
  }
}
