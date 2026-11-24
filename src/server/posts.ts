import '@tanstack/react-start/server-only'
import type { Knex } from 'knex'
import { type Post, type PostList, type Search, postInput, postPatch, commentInput } from '../board/contracts'
import { insertId } from './database'
import { ApiError, notFound, valid } from './errors'

type PostRow = {
  id: number; user_id: number; title: string; body: string; tags: string
  created_at: string; updated_at: string; nickname: string; comment_count: number | string
}

function postsWithAuthors(db: Knex) {
  const counts = db('comments').groupBy('post_id').select('post_id').count({ count: '*' }).as('counts')
  return db('posts').join('users', 'users.id', 'posts.user_id')
    .leftJoin(counts, 'counts.post_id', 'posts.id')
    .select('posts.*', 'users.nickname', db.raw('coalesce(counts.count, 0) as comment_count'))
}

function summary(row: PostRow) {
  return {
    id: row.id, title: row.title, author: { id: row.user_id, nickname: row.nickname },
    commentCount: Number(row.comment_count), createdAt: row.created_at,
  }
}

export async function listPosts(db: Knex, search: Search): Promise<PostList> {
  const { q, page, limit, sort } = search
  const posts = postsWithAuthors(db)
  const count = db('posts')
  if (q) {
    const dialect = db.client.config.client
    const contains = dialect === 'pg' ? 'strpos(lower(??), lower(?)) > 0' : 'instr(lower(??), lower(?)) > 0'
    for (const query of [posts, count]) {
      query.where((builder) => builder.whereRaw(contains, ['posts.title', q]).orWhereRaw(contains, ['posts.body', q]))
    }
  }

  if (sort === '-commentCount') posts.orderBy('comment_count', 'desc')
  const direction = sort === 'createdAt' ? 'asc' : 'desc'
  posts.orderBy('posts.created_at', direction).orderBy('posts.id', direction)
  const [rows, totals] = await Promise.all([posts.limit(limit).offset((page - 1) * limit), count.count({ total: '*' })])
  const total = Number(totals[0].total)
  return { data: rows.map(summary), meta: { page, limit, total, totalPages: Math.ceil(total / limit), q } }
}

export async function getPost(db: Knex, id: number): Promise<Post> {
  const row: PostRow | undefined = await postsWithAuthors(db).where('posts.id', id).first()
  if (!row) throw notFound()
  return { ...summary(row), body: row.body, tags: JSON.parse(row.tags), updatedAt: row.updated_at }
}

export async function createPost(db: Knex, userId: number, input: unknown) {
  const { title, body, tags } = valid(postInput, input)
  const now = new Date().toISOString()
  const id = await insertId(db, 'posts', {
    user_id: userId, title, body, tags: JSON.stringify(tags), created_at: now, updated_at: now,
  })
  return getPost(db, id)
}

async function checkOwner(db: Knex, table: 'posts' | 'comments', id: number, userId: number) {
  const row = await db(table).where({ id }).select('user_id').first()
  if (!row) throw notFound()
  if (row.user_id !== userId) throw new ApiError(403, 'FORBIDDEN', '작성자만 변경할 수 있습니다.')
}

export async function updatePost(db: Knex, userId: number, id: number, input: unknown) {
  const { tags, ...changes } = valid(postPatch, input)
  return db.transaction(async (trx) => {
    await checkOwner(trx, 'posts', id, userId)
    const changed = await trx('posts').where({ id, user_id: userId }).update({
      ...changes, ...(tags === undefined ? {} : { tags: JSON.stringify(tags) }), updated_at: new Date().toISOString(),
    })
    if (!changed) throw notFound()
    return getPost(trx, id)
  })
}

export async function deleteOwned(db: Knex, table: 'posts' | 'comments', userId: number, id: number) {
  await checkOwner(db, table, id, userId)
  if (!await db(table).where({ id, user_id: userId }).delete()) throw notFound()
}

export async function listComments(db: Knex, postId: number) {
  await getPost(db, postId)
  return commentRows(db).where('comments.post_id', postId).orderBy('comments.id').then((rows) => rows.map(mapComment))
}

function commentRows(db: Knex) {
  return db('comments').join('users', 'users.id', 'comments.user_id').select('comments.*', 'users.nickname')
}

function mapComment(row: { id: number; body: string; user_id: number; nickname: string; created_at: string }) {
  return { id: row.id, body: row.body, author: { id: row.user_id, nickname: row.nickname }, createdAt: row.created_at }
}

export async function createComment(db: Knex, userId: number, postId: number, input: unknown) {
  const { body } = valid(commentInput, input)
  return db.transaction(async (trx) => {
    await getPost(trx, postId)
    const id = await insertId(trx, 'comments', {
      user_id: userId, post_id: postId, body, created_at: new Date().toISOString(),
    })
    return mapComment(await commentRows(trx).where('comments.id', id).first())
  })
}
