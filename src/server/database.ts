import '@tanstack/react-start/server-only'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import knex, { type Knex } from 'knex'

export function openDatabase(url = process.env.DATABASE_URL, file = process.env.SQLITE_FILE ?? './data/board.sqlite') {
  if (url) {
    const protocol = new URL(url).protocol
    if (protocol === 'postgres:' || protocol === 'postgresql:') {
      return knex({ client: 'pg', connection: url, pool: { min: 0, max: 5 } })
    }
    if (protocol === 'mysql:' || protocol === 'mariadb:') {
      return knex({ client: 'mysql2', connection: url.replace(/^mariadb:/, 'mysql:'), pool: { min: 0, max: 5 } })
    }
    throw new Error('DATABASE_URL must point to PostgreSQL or MariaDB')
  }
  mkdirSync(dirname(file), { recursive: true })
  return knex({
    client: 'better-sqlite3',
    connection: { filename: file },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      afterCreate(connection: { pragma: (sql: string) => unknown }, done: (error: Error | null, connection: unknown) => void) {
        connection.pragma('foreign_keys = ON')
        connection.pragma('busy_timeout = 5000')
        done(null, connection)
      },
    },
  })
}

export async function migrate(db: Knex) {
  await db.migrate.latest({
    migrationSource: {
      async getMigrations() { return ['001-board'] },
      getMigrationName(name: string) { return name },
      async getMigration() { return { up: createTables, down: dropTables } },
    },
  })
}

async function createTables(db: Knex) {
  await db.schema.createTable('users', (table) => {
    table.increments('id')
    table.string('email', 254).notNullable().unique()
    table.string('nickname', 50).notNullable()
    table.string('password_hash').nullable()
    table.string('github_id').nullable().unique()
  })
  await db.schema.createTable('sessions', (table) => {
    table.string('token_hash', 64).primary()
    table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    table.bigInteger('expires_at').notNullable().index()
  })
  await db.schema.createTable('posts', (table) => {
    table.increments('id')
    table.integer('user_id').unsigned().notNullable().references('users.id')
    table.string('title', 200).notNullable()
    table.text('body', 'mediumtext').notNullable()
    table.text('tags').notNullable()
    table.string('created_at', 24).notNullable().index()
    table.string('updated_at', 24).notNullable()
  })
  await db.schema.createTable('comments', (table) => {
    table.increments('id')
    table.integer('post_id').unsigned().notNullable().references('posts.id').onDelete('CASCADE').index()
    table.integer('user_id').unsigned().notNullable().references('users.id')
    table.text('body').notNullable()
    table.string('created_at', 24).notNullable()
  })
  await db.schema.createTable('documents', (table) => {
    table.string('id', 36).primary()
    table.integer('user_id').unsigned().notNullable().references('users.id').index()
    table.string('filename').notNullable()
    table.text('contents').nullable()
    table.string('status', 20).notNullable()
    table.bigInteger('lease_until').notNullable().defaultTo(0)
    table.string('lease_token', 36).nullable()
    table.index(['status', 'lease_until'])
  })
  await db.schema.createTable('payments', (table) => {
    table.string('session_id').primary()
    table.integer('user_id').unsigned().notNullable().references('users.id')
    table.string('status', 20).notNullable()
  })
}

async function dropTables(db: Knex) {
  for (const name of ['payments', 'documents', 'comments', 'posts', 'sessions', 'users']) {
    await db.schema.dropTable(name)
  }
}

let ready: Promise<Knex> | undefined

export function database() {
  ready ??= (async () => {
    const db = openDatabase()
    try {
      await migrate(db)
      return db
    } catch (error) {
      await db.destroy()
      ready = undefined
      throw error
    }
  })()
  return ready
}

export async function insertId(db: Knex, table: string, row: object) {
  if (db.client.config.client === 'pg') {
    const [inserted] = await db(table).insert(row).returning('id')
    return Number(inserted.id)
  }
  const [id] = await db(table).insert(row)
  return Number(id)
}
