# study13 · 외부 서비스 연동

## 목표

Stripe 결제, Resend 메일, GitHub OAuth와 텍스트 파일 업로드의 서버 경계를 구현한다.

## 📖 이론

외부 서비스는 서버에서만 키를 사용한다. Stripe의 반환 URL은 사용자를 돌려보내고 실제 결제 상태는 서명된 웹훅으로 확인한다. OAuth는 state와 PKCE를 대조해 짧은 코드를 서버 토큰과 교환한다. 접수증과 공급자의 결제 원장이 별개라는 점을 떠올리면 된다.

## 🛠️ 실기

1. `.env`에 Stripe 테스트 시크릿·테스트 가격 ID를 넣고 `stripe listen --forward-to localhost:5173/api/payments/webhook`으로 받은 테스트 서명 키를 설정한다. 내 계정에서 결제 화면에 들어간다.
2. Resend의 발신 도메인과 `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_TEST_RECIPIENT`를 설정한다. 실습 수신 이메일로 로그인하고 내 계정 버튼을 누른다.
3. GitHub OAuth App의 callback을 `{APP_ORIGIN}/api/oauth/github/callback`으로 지정한다. `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`을 설정한다. 로그인 화면에서 이동해 확인한다.
4. `npm run worker`를 함께 실행하고 `/documents`에서 UTF-8 TXT·MD를 올린다. 지원 형식·크기와 처리 상태는 study17과 study18에서 확인한다.

### [src/server/external.ts](src/server/external.ts)

```ts
import '@tanstack/react-start/server-only'
import Stripe from 'stripe'
import type { Knex } from 'knex'
import type { User } from '../board/contracts'
import { appOrigin } from './env'
import { ApiError } from './errors'
import { limitedBody } from './http'
import { isUniqueViolation } from './auth'

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Stripe를 설정하세요.')
  return new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 })
}

export async function checkout(user: User, operationId: string) {
  const price = process.env.STRIPE_PRICE_ID
  if (!price) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Stripe 가격을 설정하세요.')
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price, quantity: 1 }],
    client_reference_id: String(user.id),
    success_url: appOrigin() + '/account?checkout=returned',
    cancel_url: appOrigin() + '/account',
  }, { idempotencyKey: 'study-' + user.id + '-' + operationId })
  return { url: session.url }
}

export async function paymentWebhook(db: Knex, request: Request) {
  const signature = request.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Stripe webhook을 설정하세요.')
  const payload = await limitedBody(request, 256 * 1024)
  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(payload, signature ?? '', secret)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'BAD_REQUEST', '웹훅 서명 검증에 실패했습니다.')
  }
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return
  const session = event.data.object as Stripe.Checkout.Session
  if (session.payment_status !== 'paid' || !session.client_reference_id) return
  const userId = Number(session.client_reference_id)
  if (!Number.isInteger(userId) || userId < 1) return
  try {
    await db('payments').insert({ session_id: session.id, user_id: userId, status: 'paid' })
  } catch (error) {
    if (!isUniqueViolation(error) && (error as { code?: string }).code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw error
  }
}

export async function sendTestMail(user: User) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  const to = process.env.MAIL_TEST_RECIPIENT
  if (!apiKey || !from || !to) throw new ApiError(503, 'SERVICE_UNAVAILABLE', '메일 발신자와 실습 수신자를 설정하세요.')
  if (user.email !== to.toLowerCase()) throw new ApiError(403, 'FORBIDDEN', '등록된 실습 수신자로 로그인하세요.')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json',
      'Idempotency-Key': 'tanstack-study-' + user.id + '-' + new Date().toISOString().slice(0, 10),
    },
    body: JSON.stringify({ from, to: [to], subject: 'TanStack 게시판 연결 확인', text: '실습 메일이 도착했습니다.' }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new ApiError(502, 'UPSTREAM_ERROR', '메일 서비스가 요청을 수락하지 않았습니다.')
  return { accepted: true }
}
```

| 줄 | 설명 |
| --- | --- |
| 1–9 | Stripe SDK, 계정 정보, 요청 제한 도구를 가져온다. |
| 10–15 | 서버 키와 외부 네트워크의 제한 시간을 설정한다. |
| 16–28 | 서버가 선택한 가격과 멱등 키로 Checkout Session을 생성한다. |
| 29–52 | 원본 바이트로 서명을 검증하고 paid 세션을 DB에 한 번 기록한다. |
| 53–70 | 승인된 발신·수신 설정과 일별 멱등 키로 테스트 메일을 보낸다. |

### [src/server/oauth.ts](src/server/oauth.ts)

```ts
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
```

| 줄 | 설명 |
| --- | --- |
| 1–8 | OAuth 입력과 세션·환경변수용 유틸을 묶는다. |
| 9–17 | 정확한 콜백 URL과 필수 서버 설정을 확인한다. |
| 18–31 | state와 PKCE verifier를 만들고 GitHub 승인 화면으로 보낸다. |
| 32–83 | state·code를 검증하고 코드 교환, 프로필·인증된 기본 이메일 확인, 게시판 세션 발급까지 수행한다. |

## 🔗 연동 포인트

`src/server/extensions.ts`에서 외부 API를 인증과 연결한다. `/api/payments`에서 로그인 사용자의 확인된 결제 수를 읽는다. 업로드는 요청에서 파일을 저장한 뒤 worker가 추출한다. 공급자 공식 문서와 설정을 확인한다. [Stripe Checkout](https://docs.stripe.com/checkout/quickstart) · [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) · [Resend 이메일](https://resend.com/docs/api-reference/emails/send-email)

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 웹훅이 400 | 잘못된 서명 키나 바뀐 원본 바디 | CLI 출력 키와 서버 환경을 맞추고 JSON 파싱 전 원본으로 검증한다. |
| OAuth 400 | state/콜백 URL 불일치 또는 만료 | 승인부터 다시 시작하고 실제 공개 Origin으로 등록한다. |
| 메일 403 | 설정한 수신 계정과 로그인 이메일이 다름 | 실습 수신 이메일로 로그인한다. |
| 문서가 queued에서 멈춤 | worker 중단 또는 업로드 볼륨 불일치 | worker를 시작하고 같은 DB와 파일 경로를 공유한다. |

## 직접 해보기

1. Stripe 테스트에서 같은 세션 이벤트를 다시 보내 결제 기록이 한 건인지 확인한다.
2. OAuth 승인과 취소 동작을 확인한다.
3. 메일 수락 응답 또는 설정 누락 503과 파일 업로드 202를 비교한다.

## ☐ 체크리스트

- [ ] 결제 웹훅·메일·OAuth 전달 경로와 환경값을 확인했다.
- [ ] 결제 URL 반환과 서명 검증 결과가 별개임을 확인했다.
- [ ] 업로드 상태 전이를 확인했다.

## 다음 단계

공통 API의 상태 코드와 요청 형식을 OpenAPI 문서로 공개한다. [study14](study14.md)
