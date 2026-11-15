const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const root = __dirname
const read = name => fs.readFileSync(path.join(root, name), 'utf8')
const sha = data => crypto.createHash('sha256').update(data).digest('hex')
const access = read('access.log').split('\n')
const session = access.filter(line => line.includes('"POST /api/auth/session HTTP/1.1"')).map(line => {
  const match = line.match(/\[([^\]]+)\] "POST \/api\/auth\/session HTTP\/1.1" (\d+) .*?"(http[^\"]+)"/)
  if (!match) throw Error('Unparsed session access row')
  return { time: match[1], status: Number(match[2]), referrer: match[3] }
})
const failedUpstream = read('error.log').split('\n').filter(line => line.includes('request: "POST /api/auth/session') && line.includes('connect() failed (111: Connection refused)'))
const ready = read('supervisor-stdout.log').split('\n').find(line => line.includes('Server running on port 3001'))
if (session.length !== 8 || session[0].status !== 502 || session.slice(1).some(row => row.status !== 200) || failedUpstream.length !== 1 || !ready?.startsWith('2026-11-15T18:35:01.203019059Z')) throw Error('Unexpected existing-log evidence')
const retained = JSON.parse(fs.readFileSync(path.join(root, '../source-before.json'), 'utf8'))
const sourcePaths = ['packages/web/src/lib/session.ts', 'packages/web/src/features/game/contexts/socket-context.tsx', 'packages/web/src/branding.ts']
const source = sourcePaths.map(file => {
  const current = fs.readFileSync(file)
  const candidate = execFileSync('git', ['show', `9b221bc0edabe449cdf27bc818ae77acbc676bae:${file}`])
  if (sha(current) !== sha(candidate) || sha(current) !== retained[file].sha256) throw Error(`Source changed: ${file}`)
  return { path: file, sha256: sha(current), identicalToRetainedCandidateAndCurrentSource: true }
})
const originals = ['access.log', 'error.log', 'supervisor-stdout.log', 'supervisor-stderr.log'].map(name => ({ path: name, bytes: fs.statSync(path.join(root, name)).size, sha256: sha(fs.readFileSync(path.join(root, name))) }))
const branding403 = access.filter(line => line.includes('"GET /branding/theme.json HTTP/1.1" 403 ')).length
fs.writeFileSync(path.join(root, 'classification.json'), JSON.stringify({ classification: 'FIXTURE_STARTUP_READINESS_RACE', newTestsOrProbe: false, originalFailingSamplePreserved: true, session, failedUpstream, backendListening: ready, source, rawReceipts: originals, separateBranding403Count: branding403, limits: 'Existing upstream uncaught initial ensureSession rejection is visible; no new auth source change or full authentication health claim. Native tenant-branding override was not exercised because this synthetic config tmpfs mode0700 denies nginx traversal.' }, null, 2))
console.log(JSON.stringify({ sessionRequests: session.length, firstStatus: session[0].status, later200: session.slice(1).length, classification: 'FIXTURE_STARTUP_READINESS_RACE', separateBranding403Count: branding403 }))
