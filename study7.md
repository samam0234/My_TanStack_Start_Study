# study7 · 인증·보안 기초

## 목표

회원가입과 로그인, 쿠키·Bearer 세션, 작성자 권한 및 브라우저 보안을 확인한다.

## 📖 이론

인증은 사용자가 누구인지, 인가는 해당 글을 바꿀 수 있는지를 판정한다. 비밀번호는 무작위 salt와 scrypt로 해시한다. 발급된 랜덤 세션 토큰의 해시와 만료만 DB에 저장한다. 비유하면 httpOnly 쿠키는 브라우저가 요청 때 가져가는 출입증이고, 작성자 검사는 개인 서랍을 여는 추가 확인이다.

## 🛠️ 실기

1. 회원가입은 201, 로그인은 200과 `data.user/accessToken`, httpOnly 쿠키를 반환한다. 화면은 토큰을 localStorage에 복사할 필요 없이 쿠키를 사용한다.
2. 루트가 서버 함수로 뷰어를 읽는다. `/posts/new`, `/account`, `/documents`는 `beforeLoad`에서 비로그인 사용자를 `/login`으로 보낸다.
3. 쿠키는 HTTPS에서 Secure, SameSite=Lax를 사용한다. 쓰기 API는 Origin을 확인하고 CORS는 지정 출처에만 허용한다. 브라우저는 JSX 텍스트로 본문을 표현하므로 사용자 HTML이 그대로 실행되지 않는다.
4. `403`이 반환되는 권한 검사와 로그아웃 후 기존 토큰으로 `401`이 반환되는 흐름을 확인한다.

### [src/server/auth.ts](src/server/auth.ts)

```ts
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
```

| 줄 | 설명 |
| --- | --- |
| 1–9 | Node 암호화 모듈, 검증 스키마와 DB 도구를 준비한다. |
| 10–14 | scrypt의 Promise 인터페이스, 한 시간 만료 및 세션 이름을 정의한다. |
| 15–25 | salt와 해시를 생성하고 timingSafeEqual로 비교한다. |
| 26–39 | HttpOnly, SameSite, Max-Age와 HTTPS의 Secure 속성을 구성한다. |
| 40–49 | Bearer 헤더와 쿠키 중 해당 토큰을 읽고 형식을 검증한다. |
| 50–55 | 랜덤 토큰을 발급하고 해시만 저장한다. |
| 56–60 | 현재 세션 토큰 해시에 대응하는 행을 삭제한다. |
| 61–68 | 만료 검사를 적용해 공개 사용자 필드만 고른다. |
| 69–74 | 인증 정보가 비어 있을 때 401을 만든다. |
| 75–79 | SQL 드라이버별 고유 제약 오류 코드를 정규화한다. |
| 80–91 | 계정에 해시만 저장하고 이메일 충돌을 409로 처리한다. |
| 92–100 | 없는 계정과 틀린 비밀번호를 동일한 401로 반환한다. |

### [src/routes/posts/new.tsx](src/routes/posts/new.tsx)

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { PostEditor } from '../../board/post-editor'

export const Route = createFileRoute('/posts/new')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/login' })
  },
  component: () => <section><h1>글쓰기</h1><PostEditor /></section>,
})
```

| 줄 | 설명 |
| --- | --- |
| 1–3 | 보호된 라우트와 편집 컴포넌트를 가져온다. |
| 4–9 | 렌더링 전에 루트 뷰어를 확인하고 필요하면 로그인으로 이동한다. |

## 🔗 연동 포인트

브라우저와 서버는 쿠키 및 `/api/auth/me`로 같은 세션을 확인한다. API 클라이언트는 `Authorization: Bearer`를 사용할 수 있다. study13의 OAuth 완료 후에도 같은 게시판 세션을 발급한다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 로그인 직후 계속 이동됨 | 루트 context 재조회 누락 또는 쿠키 정책 불일치 | 로그인 후 router.invalidate와 Origin/HTTPS 설정을 확인한다. |
| 타인 글 수정이 통과 | 화면에서 버튼만 숨김 | 서버의 `checkOwner`와 DB 조건을 함께 확인한다. |
| 브라우저 CORS 오류 | 실제 Origin과 환경 값 불일치 | 스킴·호스트·포트를 포함한 정확한 값과 OPTIONS 응답을 확인한다. |

## 직접 해보기

1. 내 글과 다른 계정 글에 각각 PATCH를 보내 200과 403을 확인한다.
2. 로그인 요청과 로그아웃 요청의 Set-Cookie를 확인한다.
3. 본문에 HTML 태그를 문자 그대로 입력해 렌더를 확인한다.

## ☐ 체크리스트

- [ ] 쿠키 세션 로그인과 보호된 라우트 (`beforeLoad`에서 redirect)
- [ ] 로그인 오류·세션 만료·권한 거절을 확인했다.

## 다음 단계

인증과 API에 섞인 공통 설정·검증·응답 도구를 역할별로 정리한다. [study8](study8.md)

[공식 문서](https://tanstack.com/start/latest/docs/framework/react/guide/authentication-overview)
