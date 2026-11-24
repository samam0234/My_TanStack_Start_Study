# study15 · 성능·캐시와 비동기

## 목표

SSR Query 캐시, 요청 타이밍, 문서 worker를 사용해 대기 시간을 관찰한다.

## 📖 이론

캐시는 같은 검색 결과를 일정 시간 재사용한다. `staleTime` 동안 데이터가 신선하며 쓰기와 알림은 캐시를 다시 읽게 한다. 파일 처리처럼 지연이 큰 일은 202로 접수하고 DB에 작업을 저장한다. 문의 창구가 자주 찾는 목록을 가까이 보관하고 오래 걸리는 작업은 번호표를 발급하는 구조다.

## 🛠️ 실기

1. `getRouter()`에서 요청별 `QueryClient`를 만들고 SSR 통합을 적용한다. 목록 loader가 `ensureQueryData(postsQuery(deps))`로 캐시를 채운다.
2. DevTools Network의 Document, 서버 함수, Waterfall을 비교한다. 같은 검색을 열기 전후에 Network의 전송 건수와 `Server-Timing`을 5회씩 기록한다. 중앙값을 함께 적는다.
3. `/documents` 업로드는 202로 접수하고 worker가 lease 토큰을 잡아 UTF-8로 읽는다. 앱은 상태를 1초 간격으로 갱신한다.
4. 데이터가 커지면 PostgreSQL에서 `EXPLAIN (ANALYZE, BUFFERS)`로 검색·정렬 비용을 보고 인덱스를 검토한다. TTL 변경, SQL 최적화, DB 풀 크기는 한 번에 하나씩 바꾼다.

```powershell
curl.exe -s -D - -o NUL 'http://localhost:5173/api/posts?q=sqlite'
npm run worker
```

### [src/router.tsx](src/router.tsx)

```tsx
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })
  const router = createRouter({
    routeTree, context: { queryClient }, defaultPreload: 'intent', defaultPreloadStaleTime: 0,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof getRouter> }
}
```

| 줄 | 설명 |
| --- | --- |
| 1–5 | Router, QueryClient, SSR 캐시 연결을 가져온다. |
| 6–10 | SSR 요청별 QueryClient를 만든 뒤 30초 freshness와 intent preload를 지정한다. |
| 11–14 | 캐시 전달과 hydration을 연결한다. |
| 15–17 | 파일 라우트 타입을 전역 Router 등록과 연결한다. |

### [scripts/worker.ts](scripts/worker.ts)

```ts
import { setTimeout as sleep } from 'node:timers/promises'
import { database } from '../src/server/database'
import { processDocument } from '../src/server/documents'

const controller = new AbortController()
process.once('SIGTERM', () => controller.abort())
process.once('SIGINT', () => controller.abort())

let cleaned = 0
try {
  const db = await database()
  try {
    console.info(JSON.stringify({ event: 'document_worker_ready' }))
    while (!controller.signal.aborted) {
      let worked = false
      try {
        const now = Date.now()
        if (now - cleaned >= 60_000) {
          await db('sessions').where('expires_at', '<=', now).delete()
          cleaned = now
        }
        worked = await processDocument(db)
      } catch (error) {
        console.error({ event: 'document_job_failed', type: (error as Error).name })
      }
      if (!worked) await sleep(1000, undefined, { signal: controller.signal })
    }
  } finally { await db.destroy() }
} catch (error) {
  if (!controller.signal.aborted) throw error
}
```

| 줄 | 설명 |
| --- | --- |
| 1–4 | DB, 문서 처리와 취소 가능한 대기를 가져온다. |
| 5–8 | 종료 신호를 받아 작업 사이의 대기를 끊는다. |
| 9–27 | DB 연결 후 문서 작업과 만료 세션 정리를 반복한다. |
| 28–31 | 종료할 때 연결을 닫고 비정상 시작 오류는 표시한다. |

## 🔗 연동 포인트

글 목록 캐시 키에는 검색 조건이 들어간다. 생성·수정·삭제와 study17 알림은 해당 캐시를 무효화한다. 공개 HTTP 캐시는 앱의 개인 쿠키·SSR에서 기본적으로 사용하지 않는다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| SSR 후 중복 조회 | freshness가 너무 짧거나 캐시 전달 누락 | SSR 통합과 초기 서버 함수 횟수를 확인한다. |
| 처리 중 작업이 남음 | worker 중단 | lease 만료 후 다른 worker가 다시 잡는지 확인한다. |
| 최적화 효과가 들쭉날쭉함 | 표본 수·데이터·캐시 조건 불일치 | 동일 조건에서 warm/cold를 분리해 기록한다. |

## 직접 해보기

1. 같은 검색을 두 번 열어 캐시 무효화 전후의 요청 수를 센다.
2. worker를 재시작하고 작업 상태 전이를 관찰한다.
3. 가시 데이터가 같은 상태에서 목록 `Server-Timing` 중앙값을 적는다.

## ☐ 체크리스트

- [ ] loader에서 TanStack Query 캐시 채우기 (`ensureQueryData`)
- [ ] 부하 측정과 파일 비동기 처리를 관찰했다.

## 다음 단계

웹·worker·DB를 컨테이너로 묶고 운영 점검을 자동화한다. [study16](study16.md)

[공식 문서](https://tanstack.com/start/latest/docs/framework/react/guide/tanstack-query)
