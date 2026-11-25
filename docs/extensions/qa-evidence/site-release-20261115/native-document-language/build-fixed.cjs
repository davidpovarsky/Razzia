const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const sha = data => crypto.createHash('sha256').update(data).digest('hex')
const evidence = '/evidence'
const original = JSON.parse(fs.readFileSync(`${evidence}/source-before.json`, 'utf8'))
const source = Object.fromEntries(Object.keys(original).map(name => {
  const data = fs.readFileSync(`/work/${name}`)
  return [name, { bytes: data.length, sha256: sha(data) }]
}))
const changed = Object.keys(source).filter(name => source[name].sha256 !== original[name].sha256)
fs.writeFileSync(`${evidence}/fixed-source.json`, JSON.stringify({ source, changed }, null, 2))
if (changed.length !== 1 || changed[0] !== 'extensions/src/site/web/shared/SiteMetadata.tsx') throw Error('Unexpected source overlay')
const build = spawnSync(process.execPath, ['/work/extensions/node_modules/vite/bin/vite.js', 'build', '--config', '/work/extensions/site.vite.config.ts', '--configLoader', 'runner', '--outDir', '/build/web'], { cwd: '/work/packages/web', env: { ...process.env, TADAZZ_SITE_ENABLED: 'true', NODE_OPTIONS: '--max-old-space-size=1024' }, stdio: 'inherit' })
fs.writeFileSync(`${evidence}/build.exit`, String(build.status))
if (build.status !== 0) process.exit(build.status || 1)
function manifest(root) {
  const result = {}
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else { const data = fs.readFileSync(file); result[path.relative(root, file)] = { bytes: data.length, sha256: sha(data) } }
    }
  }
  visit(root)
  return result
}
const before = manifest('/candidate')
const after = manifest('/build/web')
const payload = Object.keys(after).filter(name => after[name].sha256 !== before[name]?.sha256)
const bytes = payload.reduce((total, name) => total + after[name].bytes, 0)
fs.writeFileSync(`${evidence}/fixed-artifact.json`, JSON.stringify({ node: process.version, before, after, payload, bytes }, null, 2))
if (bytes > 8 * 1024 * 1024) throw Error(`Payload exceeds reserved budget: ${bytes}`)
for (const name of payload) {
  const destination = path.join(evidence, 'fixed-output/files', name)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(path.join('/build/web', name), destination, fs.constants.COPYFILE_EXCL)
}
const config = { extends: '/work/packages/web/tsconfig.app.json', compilerOptions: { incremental: true, tsBuildInfoFile: '/build/site.tsbuildinfo', types: [] }, include: [], files: ['/work/extensions/src/site/web/shared/SiteMetadata.tsx', '/work/packages/web/node_modules/vite/client.d.ts', '/work/packages/web/node_modules/@types/node/index.d.ts'] }
fs.writeFileSync('/build/tsconfig.site.json', JSON.stringify(config))
const typed = spawnSync(process.execPath, ['/work/node_modules/typescript/bin/tsc', '-p', '/build/tsconfig.site.json', '--pretty', 'false'], { cwd: '/work', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' }, stdio: 'inherit' })
fs.writeFileSync(`${evidence}/typecheck.exit`, String(typed.status))
process.stdout.write(JSON.stringify({ payloadFiles: payload.length, bytes, typecheck: typed.status }) + '\n')
process.exitCode = typed.status || 0
