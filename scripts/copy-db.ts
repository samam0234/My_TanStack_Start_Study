import { openDatabase, migrate } from '../src/server/database'

const targetUrl = process.env.DATABASE_URL
if (!targetUrl) throw new Error('Set DATABASE_URL to an empty PostgreSQL or MariaDB database')
const source = openDatabase('')
const target = openDatabase(targetUrl)
const tables = ['users', 'posts', 'comments'] as const

try {
  await migrate(source)
  await migrate(target)
  await target.transaction(async (trx) => {
    for (const table of tables) {
      if (await trx(table).first('id')) throw new Error('Target must be empty: ' + table)
      const rows = await source(table).orderBy('id')
      for (let offset = 0; offset < rows.length; offset += 50) {
        await trx(table).insert(rows.slice(offset, offset + 50))
      }
      if (target.client.config.client === 'pg') {
        await trx.raw("SELECT setval(pg_get_serial_sequence(?, 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ??",
          [table, table])
      }
      console.info(table + ': ' + rows.length)
    }
  })
} finally {
  await Promise.all([source.destroy(), target.destroy()])
}
