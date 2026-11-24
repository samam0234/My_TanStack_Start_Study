import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Knex } from 'knex'
import { ApiError, notFound } from './errors'
import { limitedBody } from './http'

export const uploadLimit = 32 * 1024

function uploadPath(id: string) {
  return join(process.env.UPLOAD_DIR ?? './data/uploads', id + '.txt')
}

export async function addDocument(db: Knex, request: Request, userId: number) {
  const filename = new URL(request.url).searchParams.get('filename') ?? ''
  if (!/^[^/\\\u0000-\u001f]{1,120}\.(txt|md)$/i.test(filename)) {
    throw new ApiError(400, 'BAD_REQUEST', 'TXT 또는 Markdown 파일을 선택하세요.')
  }
  const bytes = await limitedBody(request, uploadLimit)
  const id = randomUUID()
  await mkdir(process.env.UPLOAD_DIR ?? './data/uploads', { recursive: true })
  await writeFile(uploadPath(id), bytes, { flag: 'wx', mode: 0o600 })
  try {
    await db('documents').insert({ id, user_id: userId, filename, status: 'queued' })
  } catch (error) {
    await rm(uploadPath(id), { force: true })
    throw error
  }
  return { id, filename, status: 'queued' }
}

export async function listDocuments(db: Knex, userId: number) {
  return db('documents').where({ user_id: userId }).select('id', 'filename', 'status').orderBy('filename').limit(100)
}

export async function documentText(db: Knex, userId: number, id: string): Promise<string> {
  const row = await db('documents').where({ id, user_id: userId }).first()
  if (!row) throw notFound()
  if (row.status !== 'ready') throw new ApiError(409, 'DOCUMENT_NOT_READY', '문서 처리가 완료되지 않았습니다.')
  return row.contents
}

export async function processDocument(db: Knex) {
  const now = Date.now()
  const available = db('documents').where((query) => query.where({ status: 'queued' })
    .orWhere((expired) => expired.where({ status: 'working' }).where('lease_until', '<', now)))
  const job = await available.clone().select('id').orderBy('id').first()
  if (!job) return false
  const token = randomUUID()
  const claimed = await available.where({ id: job.id }).update({
    status: 'working', lease_until: now + 60_000, lease_token: token,
  })
  if (!claimed) return true

  let contents: string | null = null
  try {
    const bytes = await readFile(uploadPath(job.id))
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim()
    if (decoded && !decoded.includes('\0')) contents = decoded
  } catch (error) {
    console.warn(JSON.stringify({ event: 'document_read_failed', id: job.id, type: (error as Error).name }))
  }
  const saved = await db('documents').where({ id: job.id, lease_token: token }).update({
    contents, status: contents ? 'ready' : 'failed', lease_until: 0, lease_token: null,
  })
  if (saved) await rm(uploadPath(job.id), { force: true }).catch(() => {
    console.warn(JSON.stringify({ event: 'document_cleanup_failed', id: job.id }))
  })
  return true
}
