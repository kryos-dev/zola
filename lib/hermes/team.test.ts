// node --import tsx lib/hermes/team.test.ts
import assert from "node:assert/strict"
import test from "node:test"
import { deriveState, groupBoard } from "./team"

const t = (id: string, assignee: string, block_kind: string | null = null) => ({
  id,
  title: id,
  assignee,
  status: "",
  block_kind,
})

test("board grouping and waiting-on-you", () => {
  const { columns, waitingOnYou } = groupBoard({
    columns: [
      { name: "blocked", tasks: [t("a", "nila", "needs_input"), t("b", "nila", "capability")] },
      { name: "review", tasks: [t("c", "default")] },
      { name: "running", tasks: [t("d", "default")] },
    ],
  })
  assert.deepEqual(waitingOnYou.map((c) => c.id).sort(), ["a", "c"])
  assert.equal(columns.running[0].state, "running")
})

test("agent state precedence", () => {
  const { columns } = groupBoard({
    columns: [
      { name: "blocked", tasks: [t("a", "nila", "needs_input")] },
      { name: "running", tasks: [t("d", "default")] },
    ],
  })
  const cards = Object.values(columns).flat()
  assert.equal(deriveState("default", cards, []), "working")
  assert.equal(deriveState("nila", cards, []), "needs_input")
  assert.equal(deriveState("nila", cards, [{ profile: "nila" }]), "working")
  assert.equal(deriveState("sage", cards, []), "idle")
})
