import '@tanstack/react-start/server-only'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { cookie, cookieValue, isUniqueViolation, issueSession, sessionCookie } from './auth'
import { database, insertId } from './database'
import { appOrigin } from './env'
import { ApiError } from './errors'

const callback = '/api/oauth/github/callback'

function config() {
  const clientId = process.env.GITHUB_CLIENT_ID
  const secret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId || !secret) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'GitHub OAuth를 설정하세요.')
  return { clientId, secret, redirect: appOrigin() + callback }
}

export function beginOAuth() {
  const settings = config()
  const state = randomBytes(24).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const url = new URL('https://github.com/login/oauth/authorize')
  url.search = new URLSearchParams({
    client_id: settings.clientId, redirect_uri: settings.redirect, state, scope: 'user:email',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
  }).toString()
  return new Response(null, { status: 302, headers: {
    Location: url.toString(), 'Set-Cookie': cookie('github_oauth', state + '.' + verifier, 600),
  } })
}

export async function finishOAuth(request: Request) {
  const settings = config()
  const query = new URL(request.url).searchParams
  const [state, verifier] = (cookieValue(request, 'github_oauth') ?? '').split('.')
  const code = query.get('code')
  if (!state || !verifier || query.get('state') !== state || !code) {
    throw new ApiError(400, 'BAD_REQUEST', 'OAuth 요청이 만료되었거나 취소되었습니다.')
  }
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: settings.clientId, client_secret: settings.secret, code,
      redirect_uri: settings.redirect, code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const parsedToken = z.object({ access_token: z.string() }).safeParse(await tokenResponse.json())
  if (!tokenResponse.ok || !parsedToken.success) throw new ApiError(401, 'UNAUTHORIZED', 'GitHub 코드 교환에 실패했습니다.')

  const options = {
    headers: { Authorization: 'Bearer ' + parsedToken.data.access_token, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(10_000),
  }
  const [profileResponse, emailsResponse] = await Promise.all([
    fetch('https://api.github.com/user', options), fetch('https://api.github.com/user/emails', options),
  ])
  if (!profileResponse.ok || !emailsResponse.ok) throw new ApiError(502, 'UPSTREAM_ERROR', 'GitHub 프로필을 읽을 수 없습니다.')
  const profile = z.object({ id: z.number().int(), login: z.string() }).parse(await profileResponse.json())
  const emails = z.array(z.object({ email: z.email(), primary: z.boolean(), verified: z.boolean() }))
    .parse(await emailsResponse.json())
  const primary = emails.find((email) => email.primary && email.verified)
  if (!primary) throw new ApiError(403, 'FORBIDDEN', 'GitHub 기본 이메일을 인증하세요.')

  const db = await database()
  const github_id = String(profile.id)
  let userId = (await db('users').where({ github_id }).first())?.id as number | undefined
  if (!userId) {
    try {
      userId = await insertId(db, 'users', { github_id, email: primary.email.toLowerCase(), nickname: profile.login.slice(0, 50) })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      userId = (await db('users').where({ github_id }).first())?.id
      if (!userId) throw new ApiError(409, 'EMAIL_TAKEN', '기존 이메일 계정으로 로그인하세요.')
    }
  }
  const token = await issueSession(db, userId)
  const headers = new Headers({ Location: '/account' })
  headers.append('Set-Cookie', sessionCookie(token))
  headers.append('Set-Cookie', cookie('github_oauth', '', 0))
  return new Response(null, { status: 303, headers })
}
