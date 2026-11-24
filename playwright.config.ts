import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const origin = 'http://localhost:5188'
const data = mkdtempSync(join(tmpdir(), 'tanstack-study-e2e-'))

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { baseURL: origin, browserName: 'chromium' },
  webServer: {
    command: 'node .output/server/index.mjs',
    url: origin + '/health',
    env: { PORT: '5188', APP_ORIGIN: origin, CORS_ORIGIN: origin, DATABASE_URL: '', SQLITE_FILE: join(data, 'board.sqlite') },
    reuseExistingServer: false,
  },
})
