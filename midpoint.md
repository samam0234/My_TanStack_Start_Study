# midpoint · 기초 응용 · 로그인 게시판

## 목표

study0~10의 TanStack Start 서버와 SQLite로 사용할 수 있는 로그인 게시판을 완성한다.

## 기능 목록

- 익명 목록·상세·검색·정렬·페이지네이션
- 이메일 가입, 쿠키 로그인·로그아웃과 내 정보
- 작성자 글·댓글 등록·부분 수정·삭제, 보호 페이지와 오류 처리

## 폴더 구조

```text
src/routes/           # 공용 루트, /hello, 게시판, 로그인, API
src/board/            # 공용 계약, 폼, 목록, 서버 함수
src/server/           # HTTP 래퍼, 인증, 쿼리, SQLite 마이그레이션
tests/                # 단위·DB 통합·브라우저·요청 검사
.env.example          # 개발 환경에 복사하는 견본
```

## 📖 이론

같은 TanStack Start 서버 안에서 화면, HTTP API와 DB 서비스를 분리한다. `loader`는 첫 화면을 준비하고 서버 함수와 REST가 게시글 서비스를 공유한다. 접수창구 두 곳이 같은 보관대장을 조회하는 구조다.

## 🛠️ 실기 · 단계별 구현 순서

1. Node 24 및 Vite를 준비하고 `npm ci`를 실행한다.
2. `.env.example`을 복사하고 `DATABASE_URL`을 비워 SQLite를 사용한다. `npm run dev` 후 `/health`를 확인한다.
3. `/posts` 목록과 동적 상세를 만들고 공용 스키마를 API에 연결한다.
4. 회원가입 → 로그인 → 글 등록 → 수정 → 댓글 작성·삭제 → 글 삭제 → 로그아웃을 실행한다.
5. 운영 빌드와 요청 테스트를 실행한다. 기초 응용을 검증할 때는 게시판·인증 기능을 사용한다.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
# 별도 터미널에서
curl.exe -i http://localhost:5173/health
curl.exe -i http://localhost:5173/api/posts
npm test
npm run build
```

### [src/routes/api/$.ts](src/routes/api/$.ts)

```ts
import { createFileRoute } from '@tanstack/react-router'
import { boardApi } from '../../server/board-api'

export const Route = createFileRoute('/api/$')({
  server: { handlers: ({ createHandlers }) => createHandlers({
    GET: ({ request, params }) => boardApi(request, params._splat ?? ''),
    POST: ({ request, params }) => boardApi(request, params._splat ?? ''),
    PATCH: ({ request, params }) => boardApi(request, params._splat ?? ''),
    DELETE: ({ request, params }) => boardApi(request, params._splat ?? ''),
    OPTIONS: ({ request, params }) => boardApi(request, params._splat ?? ''),
  }) },
})
```

| 줄 | 설명 |
| --- | --- |
| 1–3 | TanStack 파일 라우트와 게시판 API 함수를 가져온다. |
| 4–12 | HTTP 메서드들을 등록하고 catch-all 경로를 API에 함께 전달한다. |

### [src/routes/health.ts](src/routes/health.ts)

```ts
import { createFileRoute } from '@tanstack/react-router'
import { database } from '../server/database'
import { json, respond } from '../server/http'

export const Route = createFileRoute('/health')({
  server: { handlers: {
    GET: ({ request }) => respond(request, async () => {
      await (await database()).raw('select 1')
      return json({ status: 'ok' })
    }),
  } },
})
```

| 줄 | 설명 |
| --- | --- |
| 1–4 | 서버와 DB 준비 상태에 필요한 단위를 가져온다. |
| 5–12 | DB가 준비됐을 때만 200 응답을 내도록 확인한다. |

## 🔗 연동 포인트 · DB·API 구성도

```text
[브라우저 /posts] -> [파일 라우트 loader] -> [createServerFn] ---+
[브라우저 로그인·쓰기 폼] -> [REST /api] -> [검증·세션·인가] ------+-> [Knex -> SQLite]
[브라우저] <- [SSR HTML, data/meta, error, cookie] <----------------+
```

새 페이지에서 HTML을 확인한 뒤 요청 테스트로 API와 저장 상태를 확인한다. 외부 연동·worker·서버 DB는 study11 이후에 추가한다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 보호 화면이 비어 있음 | 가입 이후 로그인 단계 생략 | 로그인해 쿠키와 `/api/auth/me`를 확인한다. |
| 운영 HTML에서 보드 목록 실패 | 빌더와 Node 실행 OS가 다르거나 DB 경로 오류 | 해당 OS에서 빌드하고 `/health`를 먼저 확인한다. |

## 직접 해보기

1. 계정 두 개로 작성자 권한을 테스트한다.
2. 브라우저 검색 URL을 다른 탭에 복사한다.
3. 빌드 서버에서 로그인 후 새로고침한다.

## ☐ 체크리스트 · 1차 배포

- [ ] 개발과 운영 모드에서 `/health` 및 목록 응답을 확인했다.
- [ ] 글·댓글 CRUD, 401·403·404, 쿠키 로그아웃을 시험했다.
- [ ] 환경값과 SQLite 데이터를 구분하고 첫 배포의 도메인·HTTPS를 점검했다.

## 회고

기초에서 가장 중요한 경계는 화면의 보호 라우트와 API의 실제 권한 검사다. 흐름을 재현한 날짜와 브라우저/HTTP 검증 결과를 기록하고, 운영에서 필요한 복구 시간과 데이터 이전 범위를 적는다.

## 다음 단계

로컬 SQLite에서 운영 PostgreSQL로 갈아끼우고 MariaDB·MongoDB의 저장 구조를 실습한다. [study11](study11.md)
