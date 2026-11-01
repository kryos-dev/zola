// Hermes profiles ("personas"). The gateway serves the default profile at
// HERMES_API_URL and each named profile at HERMES_API_URL/p/<name>/..., and a
// named profile only accepts its own bearer key. Keys stay on the server:
// listProfiles() is the only shape that may reach the browser.
//
// HERMES_PROFILES = "name:label:key,name:label:key". The default profile is
// always present (label "Gideon", key HERMES_API_KEY).

export const DEFAULT_PROFILE = "default"
const DEFAULT_LABEL = "Gideon"

type Entry = { name: string; label: string; key: string }

const NAME = /^[a-z0-9][a-z0-9_-]*$/i

function entries(): Entry[] {
  const named = (process.env.HERMES_PROFILES ?? "")
    .split(",")
    .map((raw) => raw.trim().split(":"))
    .filter(([name, label, ...key]) => NAME.test(name ?? "") && label && key.length)
    .map(([name, label, ...key]) => ({ name, label, key: key.join(":") }))
    .filter((e) => e.name !== DEFAULT_PROFILE)
  return [
    { name: DEFAULT_PROFILE, label: DEFAULT_LABEL, key: process.env.HERMES_API_KEY ?? "" },
    ...named,
  ]
}

// One-line job description shown on the Team screen, keyed by profile name.
const ROLES: Record<string, string> = { [DEFAULT_PROFILE]: "Ops", nila: "Support" }

export type ProfileInfo = { name: string; label: string; role: string }

export function listProfiles(): ProfileInfo[] {
  return entries().map(({ name, label }) => ({ name, label, role: ROLES[name] ?? "Agent" }))
}

export function isProfile(name: string): boolean {
  return entries().some((e) => e.name === name)
}

/** Gateway base url and bearer key for a profile; unknown names fall back to the default. */
export function profileBase(name: string): { baseUrl: string; key: string } {
  const root = (process.env.HERMES_API_URL ?? "").replace(/\/+$/, "")
  const e = entries().find((x) => x.name === name)
  if (!e || e.name === DEFAULT_PROFILE) return { baseUrl: root, key: entries()[0].key }
  return { baseUrl: `${root}/p/${e.name}`, key: e.key }
}
