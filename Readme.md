# TanStack Start 공부

TanStack Start로 로그인 게시판을 구현하고 같은 프로젝트에 PostgreSQL, 외부 연동, 실시간 알림과 문서 AI를 추가한다. 실습 원본은 [Notion TanStack Start](https://app.notion.com/p/41fd7dec5e2e81cbb7c0d2a3d8fad8b7)다.

## 개발 실행

```powershell
node --version
npm ci
Copy-Item .env.example .env
npm run dev
```

브라우저에서 http://localhost:5173 을 열고 회원가입 → 로그인 → 글과 댓글 작성 순으로 확인한다. 개발 기본 DB는 SQLite다. 문서 실습은 별도 터미널에서 `npm run worker`를 실행한다. 빈 DB로 시작할 때는 웹에서 `/health`를 먼저 호출한다.

## 운영 구성 실습

```powershell
docker compose up -d --build --wait
docker compose ps
curl.exe -i http://localhost:3000/health
```

Compose는 PostgreSQL·웹·worker를 올린다. 로컬 개발용 `.env`에 5173 Origin이 남아 있으면 Compose 시작 시 `$env:APP_ORIGIN = "http://localhost:3000"` 및 `$env:CORS_ORIGIN = "http://localhost:3000"`을 설정한다. `/api-docs`의 Swagger UI와 `/openapi.json`에서 v1 명세를 확인할 수 있다.

외부 결제·메일·OAuth 설정은 [study13](study13.md), OpenAI 및 기본 로컬 발췌 모드는 [study18](study18.md), 운영 배포 설정과 백업은 [study16](study16.md)에 있다.

## 검사

```powershell
npm run build
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run mcp:client
```

## 전체 학습 순서

| 파일 | 주제 |
| --- | --- |
| [study0](study0.md) | 환경 설정 |
| [study1](study1.md) | Hello World와 기본 문법 |
| [study2](study2.md) | 핵심 구조와 조립 |
| [study3](study3.md) | 데이터와 상태 |
| [study4](study4.md) | 라우팅과 요청 처리 |
| [study5](study5.md) | 폼·입력·검증 |
| [study6](study6.md) | DB·API 연동 |
| [study7](study7.md) | 인증·보안 기초 |
| [study8](study8.md) | 구조화·재사용 |
| [study9](study9.md) | 테스트·디버깅 |
| [study10](study10.md) | 배포와 기초 정리 |
| [midpoint](midpoint.md) | 기초 응용 · 로그인 게시판 |
| [study11](study11.md) | DB 확장 |
| [study12](study12.md) | 프론트·UI 연동 |
| [study13](study13.md) | 외부 서비스 연동 |
| [study14](study14.md) | API 설계·문서화 |
| [study15](study15.md) | 성능·캐시와 비동기 |
| [study16](study16.md) | 운영·CI/CD |
| [study17](study17.md) | 실시간과 파일 처리 |
| [study18](study18.md) | AI 연동과 MCP |
| [final](final.md) | 심화 응용 · 게시판과 문서 AI |
