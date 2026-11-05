#!/usr/bin/env node
/** Read-only byte parity check of the V4 artwork delivered by Goldy. */
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
const root = resolve(import.meta.dirname, '../..')
const htmlPath = join(root, 'docs/extensions/references/TADAZZ_Motion_Library_v4_20261105.html')
const manifestPath = join(root, 'docs/extensions/references/tadazz-v4/assets-manifest.json')
const sha256 = (b) => createHash('sha256').update(b).digest('hex')
const source = readFileSync(htmlPath)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (sha256(source) !== manifest.sourceSha256) throw Error('V4 original HTML changed or source mismatch')
const match = source.toString('utf8').match(/window\.TADAZZ_ASSETS=(\{[^\n]+\})/)
if (!match) throw Error('V4 assets JSON payload missing')
const embedded = JSON.parse(match[1])
const result = []
for (const a of manifest.assets) {
  const raw = embedded[a.path]
  if (!raw?.startsWith(`data:${a.mime};base64,`)) throw Error('Missing MIME/data-URI: '+a.path)
  const bytes = Buffer.from(raw.split(',')[1], 'base64')
  if (sha256(bytes) !== a.sha256) throw Error('Embedded asset changed: '+a.path)
  const file = join(root, 'packages/web/public/tadazz-show/v4', a.path.replace(/^assets\//, ''))
  if (!existsSync(file) || sha256(readFileSync(file)) !== a.sha256) throw Error('Extracted file not identical: '+file)
  result.push({ file: a.path, bytes: a.bytes, sha256: a.sha256 })
}
console.log(JSON.stringify({ok:true, sourceSha256:manifest.sourceSha256, verified:result.length, assets:result}, null, 2))
