import { defineConfig } from 'nitro'

export default defineConfig({
  serverDir: './server',
  features: { websocket: true },
  traceDeps: ['knex', 'better-sqlite3', 'pg', 'mysql2'],
})
