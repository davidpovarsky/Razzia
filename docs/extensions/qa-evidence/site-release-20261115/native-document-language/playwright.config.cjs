module.exports = {
  testDir: '/evidence/src/site/tests/browser',
  testMatch: 'native-document-language.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 45000,
  outputDir: '/tmp/native-language-results',
  reporter: [['list'], ['json', { outputFile: '/evidence/spec-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:3000', headless: true },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--no-sandbox', '--disable-dev-shm-usage'] } } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
}
