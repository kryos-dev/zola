// node --import tsx lib/hermes/profiles.test.ts
import assert from "node:assert/strict"
import test from "node:test"
import { isProfile, listProfiles, profileBase } from "./profiles"

test("profiles", () => {
  process.env.HERMES_API_URL = "http://h:8642/"
  process.env.HERMES_API_KEY = "dk"
  process.env.HERMES_PROFILES = "akka:Akka:sk-a, sage:Sage:sk-s ,bad,default:X:y"
  assert.deepEqual(listProfiles(), [
    { name: "default", label: "Kavalan", role: "Engineer" },
    { name: "akka", label: "Akka", role: "Agent" },
    { name: "sage", label: "Sage", role: "Agent" },
  ])
  assert.deepEqual(profileBase("default"), { baseUrl: "http://h:8642", key: "dk" })
  assert.deepEqual(profileBase("akka"), { baseUrl: "http://h:8642/p/akka", key: "sk-a" })
  assert.equal(profileBase("nope").key, "dk")
  assert.ok(isProfile("sage") && !isProfile("nope"))
  delete process.env.HERMES_PROFILES
  assert.equal(listProfiles().length, 1)
})
