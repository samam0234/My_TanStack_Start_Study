import '@tanstack/react-start/server-only'
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Knex } from 'knex'
import { type User, signupInput, loginInput } from '../board/contracts'
import { insertId } from './database'
import { secureCookies } from './env'
import { ApiError, valid } from './errors'

const derive = promisify(scrypt)
const maxAge = 3600
const cookieName = 'board_session'
const missingHash = '00000000000000000000000000000000:' + '00'.repeat(64)

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  return salt + ':' + (await derive(password, salt, 64) as Buffer).toString('hex')
}

async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':')
  const candidate = await derive(password, salt, 64) as Buffer
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'))
}

export function sessionCookie(token: string, age = maxAge) {
  return cookie(cookieName, token, age)
}

export function cookie(name: string, value: string, age: number) {
  return [name + '=' + value, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + age,
    ...(secureCookies() ? ['Secure'] : [])].join('; ')
}

export function cookieValue(request: Request, name: string) {
  return request.headers.get('cookie')?.split(';').map((item) => item.trim())
    .find((item) => item.startsWith(name + '='))?.slice(name.length + 1)
}

function tokenFrom(request: Request) {
  const header = request.headers.get('authorization')
  const token = header === null ? cookieValue(request, cookieName) : /^Bearer ([a-f0-9]{64})$/i.exec(header)?.[1]
  return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined
}

function digest(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueSession(db: Knex, id: number) {
  const token = randomBytes(32).toString('hex')
  await db('sessions').insert({ token_hash: digest(token), user_id: id, expires_at: Date.now() + maxAge * 1000 })
  return token
}

export async function revokeSession(db: Knex, request: Request) {
  const token = tokenFrom(request)
  if (token) await db('sessions').where({ token_hash: digest(token) }).delete()
}

export async function currentUser(db: Knex, request: Request): Promise<User | null> {
  const token = tokenFrom(request)
  if (!token) return null
  return await db('sessions').join('users', 'users.id', 'sessions.user_id')
    .where({ token_hash: digest(token) }).where('expires_at', '>', Date.now())
    .select('users.id', 'users.email', 'users.nickname').first() ?? null
}

export async function requireUser(db: Knex, request: Request) {
  const user = await currentUser(db, request)
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
  return user
}

export function isUniqueViolation(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '23505' || code === 'ER_DUP_ENTRY' || code === 'SQLITE_CONSTRAINT_UNIQUE'
}

export async function signup(db: Knex, input: unknown): Promise<User> {
  const { email, password, nickname } = valid(signupInput, input)
  const passwordHash = await hashPassword(password)
  try {
    const id = await insertId(db, 'users', { email, nickname, password_hash: passwordHash })
    return { id, email, nickname }
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, 'EMAIL_TAKEN', '이미 사용 중인 이메일입니다.')
    throw error
  }
}

export async function login(db: Knex, input: unknown): Promise<User> {
  const { email, password } = valid(loginInput, input)
  const row = await db('users').where({ email }).first()
  const matches = await verifyPassword(password, row?.password_hash ?? missingHash)
  if (!matches || !row?.password_hash) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인하세요.')
  }
  return { id: row.id, email: row.email, nickname: row.nickname }
}
