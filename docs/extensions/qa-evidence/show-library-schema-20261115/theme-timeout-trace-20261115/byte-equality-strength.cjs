const fs = require("node:fs")
const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const bytes = fs.readFileSync("/workspace/packages/web/public/tadazz-show/v4/tadazz-brand-logo.png")
const sha = value => createHash("sha256").update(value).digest("hex")
const before = sha(bytes)
const exact = (actual, expected) => Buffer.isBuffer(actual) && actual.length === expected.length && actual.equals(expected)
const cases = []
function check(name, actual, expected) { assert.equal(exact(actual, bytes), expected); cases.push({name, pass: true}) }
check("same real bytes copied into distinct Buffer", Buffer.from(bytes), true)
for (const index of [0, Math.floor(bytes.length/2), bytes.length-1]) {
  const changed = Buffer.from(bytes); changed[index] ^= 1
  check(`changed byte at ${index}`, changed, false)
}
check("shorter real Buffer", bytes.subarray(0, bytes.length-1), false)
check("longer real Buffer", Buffer.concat([bytes, Buffer.from([0])]), false)
check("non-Buffer type rejected", new Uint8Array(bytes), false)
assert.equal(sha(bytes), before)
console.log(JSON.stringify({status:"PASS", bytes:bytes.length,fixtureSha256:before,fixtureUnchanged:true,node:process.version,cases}))
