# final · 심화 응용 · 게시판과 문서 AI

## 목표

TanStack Start 한 프로젝트에 운영 DB, 외부 연동, 문서 AI, 배포 및 보안 점검을 이어 완성한다.

## 기능 목록

- PostgreSQL 운영 게시판과 쿠키 인증·검색·글·댓글 CRUD
- Radix Dialog, TanStack Form·Query, Zustand 표시 모드, Swagger API 문서
- Stripe Checkout과 서명 검증, Resend 테스트 메일, GitHub OAuth
- 텍스트 업로드, 백그라운드 작업, WebSocket 목록 갱신, 근거 스트리밍과 MCP
- Docker Compose, CI 검사·SHA 이미지 발행·설정 시 자동 배포

## 📖 이론

웹과 worker가 같은 DB와 임시 파일 볼륨을 쓴다. 공개 진입점은 HTTPS 프록시, 로그인 데이터와 파일은 서버 권한 확인 안에 있다. 목록의 변경 신호는 WebSocket, 요청과 응답 규칙은 공통 API v1을 사용한다. 하나의 건물에서 공개 안내 창구와 직원 자료실의 출입증을 따로 관리하는 구조다.

## 연동 구성도

```text
[브라우저] <== HTTPS + WSS ==> [Caddy] <==> [TanStack Start / Nitro]
                                     SSR / REST / OpenAPI / Socket |
                [GitHub OAuth · Stripe · Resend · OpenAI] <--------+
                                       [PostgreSQL] <--------------+
                                         ^                   ^
                                         |                   |
                                [문서 worker] <--> [공유 임시 볼륨]
[로컬 MCP 클라이언트] <== stdio ==> [읽기 전용 발췌 도구]
```

## 🛠️ 실기 · 단계별 구현 순서

1. midpoint 기초 게시판을 실행하고 study11의 SQLite→빈 PostgreSQL 이관을 수행한다. 초기 실습은 Compose 새 PostgreSQL에서 시작할 수 있다.
2. 목록·편집 폼과 `/api-docs`의 v1 문서를 확인한다. 결제·메일·OAuth는 study13에 따라 테스트 환경값을 등록한다.
3. 앱과 worker를 올린 후 TXT·MD를 업로드하고 ready 상태를 확인한다. 근거 질문, 없는 근거, 취소, MCP 도구를 실행한다.
4. DB와 앱의 헬스 확인 뒤 두 탭에서 WebSocket 갱신을 검증한다. 로그인 경로, API 401/403, CORS, 파일 크기와 소유자 접근, 웹훅 서명, 서버 비밀값을 점검한다.
5. Docker 이미지와 CI 테스트를 통과시킨다. 운영 러너와 환경을 준비하면 SHA 이미지를 사용해 배포하고, 외부 HTTPS에서 smoke test와 복구 연습을 한다.

```powershell
npm ci
npm run build
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run mcp:client
docker compose up -d --build --wait
curl.exe -i http://localhost:3000/health
curl.exe -i http://localhost:3000/api/posts
```

### [compose.yaml](compose.yaml)

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: board
      POSTGRES_USER: board
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-board-local-only}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U board -d board"]
      interval: 3s
      timeout: 3s
      retries: 20
    restart: unless-stopped

  web:
    build: .
    image: ${BOARD_IMAGE:-tanstack-start-study:local}
    environment:
      APP_ORIGIN: ${APP_ORIGIN:-http://localhost:3000}
      CORS_ORIGIN: ${CORS_ORIGIN:-}
      DATABASE_URL: ${COMPOSE_DATABASE_URL:-postgresql://board:board-local-only@db:5432/board}
      UPLOAD_DIR: /app/data/uploads
      LOG_REQUESTS: "1"
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      OPENAI_MODEL: ${OPENAI_MODEL:-}
      GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID:-}
      GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET:-}
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:-}
      STRIPE_PRICE_ID: ${STRIPE_PRICE_ID:-}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:-}
      RESEND_API_KEY: ${RESEND_API_KEY:-}
      MAIL_FROM: ${MAIL_FROM:-}
      MAIL_TEST_RECIPIENT: ${MAIL_TEST_RECIPIENT:-}
    ports:
      - "${BIND_ADDRESS:-127.0.0.1}:${BOARD_PORT:-3000}:3000"
    volumes:
      - uploads:/app/data
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
      interval: 5s
      timeout: 4s
      retries: 20
    restart: unless-stopped

  worker:
    image: ${BOARD_IMAGE:-tanstack-start-study:local}
    command: ["node", "--import", "tsx", "scripts/worker.ts"]
    environment:
      DATABASE_URL: ${COMPOSE_DATABASE_URL:-postgresql://board:board-local-only@db:5432/board}
      UPLOAD_DIR: /app/data/uploads
    volumes:
      - uploads:/app/data
    depends_on:
      web:
        condition: service_healthy
    restart: unless-stopped

  maria:
    image: mariadb:11.4
    profiles: ["db-labs"]
    environment:
      MARIADB_ROOT_PASSWORD: lab-root-only
      MARIADB_DATABASE: board
      MARIADB_USER: board
      MARIADB_PASSWORD: board-local-only
    ports:
      - "127.0.0.1:13309:3306"

  mongo:
    image: mongo:8
    profiles: ["db-labs"]
    ports:
      - "127.0.0.1:27019:27017"

volumes:
  postgres-data:
  uploads:
```

| 줄 | 설명 |
| --- | --- |
| 1–16 | DB 서비스를 만들고 PostgreSQL 볼륨과 준비 검사를 지정한다. |
| 17–49 | Node 이미지와 서버 환경을 주입하고 요청이 들어올 포트·파일 볼륨·health를 연결한다. |
| 50–62 | 웹이 준비된 뒤 같은 이미지로 문서 작업을 실행한다. |
| 63–79 | 별도 실습 프로필에서 MariaDB와 MongoDB를 loopback 포트로 연다. |
| 80–82 | PostgreSQL과 업로드의 영속 볼륨 이름을 등록한다. |

## 🔗 연동 포인트

실제 서비스 연결값은 `.env.example`을 참고해 서버에 넣는다. 코드·설정은 [Dockerfile](Dockerfile), [CI](.github/workflows/ci.yml), [배포](.github/workflows/deploy.yml), [보드 브라우저 검증](tests/e2e/board.spec.ts)에서 이어진다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| DB가 healthy인데 web이 실패 | 웹 URL의 DB 인증 정보가 DB와 다름 | Compose에서 주입된 연결의 사용자와 비밀번호를 확인한다. |
| 외부 서비스가 503 | 공급자 환경값 없음 | 테스트용 설정을 주입하고 제공자별 확인 절차를 실행한다. |
| 다른 탭에서 업데이트 없음 | 웹소켓 Origin 또는 프록시 불일치 | HTTPS URL과 WS 업그레이드를 확인하고 REST의 목록 갱신과 대조한다. |

## 직접 해보기

1. 사용자 A의 문서에 사용자 B가 접근하면 404가 나오는지 확인한다.
2. 앱과 worker를 재시작해 PostgreSQL 게시물과 대기 작업이 유지되는지 확인한다.
3. 동일 이미지 버전으로 배포한 뒤 이전 SHA로 되돌리는 연습을 한다.

## ☐ 체크리스트 · 최종 배포

- [ ] DB 이관 범위, 건수 및 운영 DB 백업·복원을 확인했다.
- [ ] 단위·브라우저·API·MCP 검증을 실행했다.
- [ ] HTTPS·쿠키·권한·CSRF/XSS·비밀 환경값·파일 크기 제한을 점검했다.
- [ ] 외부 서비스 테스트 자격 증명과 관리 화면을 확인했다.
- [ ] SHA 이미지 배포, Health·로그, WebSocket, AI 스트림을 점검했다.

## 최종 회고

처음에는 SQLite와 기본 CRUD만으로 요청 흐름을 확인했다. 운영에서는 같은 API 계약을 유지한 채 저장 위치와 작업 실행 위치를 바꿨다. 최종 재현에서는 외부 공급자 키가 없는 상태에서도 확인한 로컬 흐름, 테스트 자격 증명이 필요한 부분, 배포 주소와 백업 복구 결과를 각각 기록한다.

## 번호에 넣지 않은 Notion 체크 항목

- `createServerFn`으로 서버 함수 만들기 (Next Server Action과 비교) — 원문에 다른 프레임워크 비교가 포함되어 번호별 체크리스트에서 제외했다. TanStack Start 서버 함수 구현은 study4에 있다.

## 다음 단계

README의 실행 경로에서 모든 단계와 검증 명령을 다시 확인한다. [Readme](Readme.md)
