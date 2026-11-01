import { MODEL_DEFAULT } from "@/lib/config"
import { useModel as useModelStore } from "@/lib/model-store/provider"
import type { UserProfile } from "@/lib/user/types"
import { useCallback, useState } from "react"

/**
 * The model the next message goes out on: a local pick, else the first
 * favourite the server still offers, else the default. Nothing is persisted per
 * conversation; there is one rolling session.
 */
export function useModel({ user }: { user: UserProfile | null }) {
  const { models } = useModelStore()
  const [localSelectedModel, setLocalSelectedModel] = useState<string | null>(null)

  // Against the lanes the server actually returned, not a static list: a
  // lane enabled on the Models page has to be selectable without a redeploy.
  // An empty list means the models have not loaded yet; treating that as
  // "nothing is known" would flip the picker to the default mid-load.
  const known = (id?: string | null) =>
    !!id && (models.length === 0 || models.some((m) => m.id === id))
  const selectedModel =
    localSelectedModel || user?.favorite_models?.find(known) || MODEL_DEFAULT

  const handleModelChange = useCallback(async (newModel: string) => {
    setLocalSelectedModel(newModel)
  }, [])

  return { selectedModel, handleModelChange }
}
