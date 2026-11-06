import { defineConfig, devices } from '@playwright/test'
import { join } from 'node:path'
import fs from 'node:fs'
const root = join(import.meta.dirname, '../..')
const config = join(root, 'work/next-acceptance-config')
fs.mkdirSync(config, {recursive:true})
export default defineConfig({
  testDir: 'tests', testMatch: 'tadazz-next-live.spec.ts', workers: 1,
  timeout: 600000, expect: { timeout: 20000 }, reporter: 'list',
  outputDir: '../../work/next-acceptance-results',
  use: { baseURL: 'http://127.0.0.1:3250', locale: 'en-US', video: 'on', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } }],
  webServer: [
    { command: 'node --import tsx src/index.ts', cwd: join(root, 'packages/socket'), url: 'http://127.0.0.1:3251/api/health', env: { CONFIG_PATH: config, MANAGER_PASSWORD: 'e2e-password', JWT_SECRET: 'next-local-acceptance-secret-32-characters', SOCKET_PORT: '3251', GAME_SPEED: '3' } },
    { command: 'node --experimental-strip-types node_modules/vite/bin/vite.js preview --port 3250 --strictPort', cwd: join(root, 'packages/web'), url: 'http://127.0.0.1:3250', env: { CONFIG_PATH: config, SOCKET_PORT: '3251', WEB_PORT: '3250' } }
  ]
})
