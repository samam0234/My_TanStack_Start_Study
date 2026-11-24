import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { postPatch, validateSearch } from '../src/board/contracts'
import { excerpts } from '../src/board/excerpts.mjs'
import { openDatabase, migrate } from '../src/server/database'
import { createPost, listPosts, updatePost } from '../src/server/posts'
import { signup } from '../src/server/auth'

test('normalizes malformed search and limits page size', () => {
  expect(validateSearch({ page: '-3', q: '  board ', limit: '120', sort: 'invalid' }))
    .toEqual({ page: 1, q: 'board', limit: 50, sort: '-createdAt' })
})
test('PATCH only changes fields that are provided', () => {
  expect(postPatch.parse({ title: 'new' })).toEqual({ title: 'new' })
  expect(postPatch.safeParse({}).success).toBe(false)
})
test('returns no excerpt when the document has no matching ground', () => {
  expect(excerpts('SQLite 사용 안내', 'PostgreSQL')).toEqual([])
})

describe('database port', () => {
  test('passes normalized search to the adapter', async () => {
    const count = vi.fn().mockResolvedValue([{ total: 0 }])
    const chain = { where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), offset: vi.fn().mockResolvedValue([]) }
    for (const name of ['where', 'orderBy', 'limit'] as const) chain[name].mockReturnValue(chain)
    const fake = Object.assign(vi.fn()
      .mockReturnValueOnce({ groupBy: () => ({ select: () => ({ count: () => ({ as: () => ({}) }) }) }) })
      .mockReturnValueOnce({ join: () => ({ leftJoin: () => ({ select: () => chain }) }) })
      .mockReturnValueOnce({ count }), { raw: vi.fn(), client: { config: { client: 'better-sqlite3' } } })
    const result = await listPosts(fake as never, validateSearch({ page: 2, limit: 5 }))
    expect(chain.offset).toHaveBeenCalledWith(5)
    expect(result.meta).toEqual({ page: 2, limit: 5, total: 0, totalPages: 0, q: '' })
  })

  test('migrates a fresh sqlite file and preserves tags during a partial edit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tanstack-board-'))
    const db = openDatabase('', join(directory, 'board.sqlite'))
    try {
      await migrate(db)
      const person = await signup(db, { email: 'test@example.com', password: 'example-only', nickname: 'tester' })
      const post = await createPost(db, person.id, { title: 'First', body: 'Read about SQLite', tags: ['notes'] })
      await expect(updatePost(db, person.id, post.id, { title: 'Edited' })).resolves.toMatchObject({ tags: ['notes'] })
      await expect(listPosts(db, validateSearch({ q: 'sqlite' }))).resolves.toMatchObject({ meta: { total: 1 } })
    } finally { await db.destroy(); await rm(directory, { recursive: true, force: true }) }
  })
})
