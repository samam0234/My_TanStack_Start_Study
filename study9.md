# study9 · 테스트·디버깅

## 목표

단위·SQLite 통합·HTTP·브라우저 테스트로 입력부터 렌더링까지 확인한다.

## 📖 이론

단위 테스트는 검색 정규화 같은 좁은 규칙을, 통합 테스트는 실제 SQLite 스키마를, 요청과 브라우저 테스트는 배포 대상 번들에서 쿠키·상태 코드·렌더링을 검사한다. 공연 전 대본 확인과 전체 리허설처럼 서로 다른 종류의 실수를 발견한다.

## 🛠️ 실기

1. `npm test`로 검증과 디스크 DB 테스트를 실행한다. 테스트마다 임시 폴더를 사용하고 종료할 때 정리한다.
2. `npm run build` 뒤 Playwright를 실행한다. `page.route(..., route.fulfill(...))`을 브라우저 테스트에 임시로 붙이면 UI에서 500·429 화면을 재현할 수 있다. DB는 서비스 첫 인자인 `db`에 테스트 대역을 주입한다.
3. DevTools의 Network, Console, Sources를 살핀다. 서버 요청 로그는 `LOG_REQUESTS=1`에서 켜며 응답 `X-Request-Id`로 찾는다.

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

### [tests/contracts.test.ts](tests/contracts.test.ts)

```ts
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
```

| 줄 | 설명 |
| --- | --- |
| 1–10 | Vitest, 임시 폴더·DB와 테스트 대상 계약을 가져온다. |
| 11–14 | 잘못된 번호와 범위를 보정하는 검색 단위 테스트다. |
| 15–18 | 부분 수정의 필드 기본값 회귀를 막는다. |
| 19–22 | 문서 근거가 없을 때를 검증한다. |
| 23–36 | Knex 모양의 목과 실제 SQLite를 분리해 조회·변경을 검증한다. |
| 37–48 | 실제 파일에 마이그레이션과 CRUD를 실행하고 정리한다. |

## 🔗 연동 포인트

`tests/e2e/board.spec.ts`의 요청 테스트는 제품과 같은 서버 응답을 확인한다. CI에서 같은 검사를 실행하고 `/health`, `X-Request-Id`로 운영에서 이력을 찾는다.

## 오류 노트 · TOP 10

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 404 화면 | 파일·라우트 선언 불일치 | 생성된 라우트 트리와 주소를 확인한다. |
| 400 BAD_REQUEST | JSON 문법 또는 ID 오류 | Network의 요청 본문과 경로를 확인한다. |
| 400 VALIDATION_ERROR | 필수 입력 누락 | `error.fields`를 입력 필드에 대응한다. |
| 401 UNAUTHORIZED | 세션 없음 또는 만료 | 쿠키와 `/api/auth/me`를 확인한다. |
| 403 FORBIDDEN | 작성자 불일치 또는 Origin 거절 | 세션 ID와 요청 Origin을 확인한다. |
| 409 EMAIL_TAKEN | 테스트 이메일 재사용 | 테스트별 고유 이메일을 사용한다. |
| Hydration 경고 | 서버와 브라우저의 최초 화면 불일치 | 브라우저 전용 값을 useEffect에서 읽는다. |
| SQLite 잠금 | DB 파일을 여러 프로세스가 쓰기 중 | 트랜잭션을 짧게 유지하고 DB 경로를 분리한다. |
| 포트 충돌 | 개발 또는 E2E 주소 선점 | Vite 로그와 Playwright 포트 5188을 확인한다. |
| 테스트 브라우저 누락 | Chromium이 설치되지 않음 | `npx playwright install chromium`을 실행한다. |

## 직접 해보기

1. 임시 오류 응답으로 UI에 요청 오류가 표시되는지 확인한다.
2. `--headed`로 보호 라우트 E2E 흐름을 직접 관찰한다.
3. 응답 헤더의 요청 ID 하나를 서버 로그에서 찾는다.

## ☐ 체크리스트

- [ ] 단위·통합·요청·브라우저 테스트를 실행했다.
- [ ] DB 목의 호출 검증과 실제 DB 결과 검증의 차이를 설명할 수 있다.

## 다음 단계

테스트가 통과한 동일 빌드를 Node 운영 서버로 실행한다. [study10](study10.md)

[공식 문서](https://playwright.dev/docs/test-api-testing)
