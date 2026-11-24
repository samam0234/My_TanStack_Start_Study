# 에이전트 공통 가이드라인 (인수인계 문서)

이 문서는 이 저장소에서 작업하는 모든 AI 에이전트(Claude, Grok, Codex 등)가 **공통으로** 지켜야 할 규칙을 정리한 인수인계 문서입니다.
`.claude/`, `.grok/`, `.codex/` 폴더의 에이전트별 문서는 이 문서를 기본으로 삼고, 도구별 특이사항만 추가로 기술합니다.

## 현재 과정 기준 (2026-11-23 사용자 요청)

- Next.js 한 프레임워크만 학습한다. 다른 프레임워크와 비교·통합하지 않는다. 아래의 초기 기록보다 이 절과 최신 사용자 요청이 우선한다.
- 루트 학습 문서는 `study0.md`~`study18.md`, `studyMidpoint.md`, `studyFinal.md`의 21개다. 모든 학습 파일명은 study로 시작한다.
- 각 문서는 목표·이론·전체 코드와 줄별 설명·연동·오류·연습 2~3개·빈 체크리스트·다음 단계의 8개 구성을 유지한다.
- `demo`는 기초 v1 로그인 게시판(`/board`), `project`는 문서·AI 작업실(`/workbench`)을 확장한다. 기존 JSON `/posts`와 SQLite `/notes`는 이전 실습 기록으로 보존한다.
- 기능 원본은 `tsx_version/project/src/course`다. `scripts/sync-course.mjs`, `scripts/configure-course.mjs`, `scripts/sync-support.mjs`로 JSX·TSX를 맞춘다. demo의 Repository는 기초 SQLite로 제한하고 심화 HTTP는 project의 entry에서 연결한다.
- 문서 원본 데이터는 `scripts/course-chapters.mjs`이며 `scripts/generate-study.mjs`로 실제 코드와 함께 생성한다. `scripts/verify-study.mjs`가 문서 구성·연습 수·코드 해시·원문 체크를 검사한다.
- 노션 반영표는 `docs/notion-coverage.json`, 실검증 결과는 `docs/validation.md`다. mock·코드 준비·실계정·운영 검증을 구분한다.
- 문서·코드 검증 후 노션을 갱신한다. 커밋은 아래 COMMIT_GUIDE의 번호별 분리 규칙을 유지하고 midpoint는 study10 뒤, final은 study18 뒤에 둔다.
- `npm run lint`, `npm test`, `npm run build`, `npm run test:http`를 각 앱에서 확인한다. Next.js 16부터 proxy 명칭을 사용한다.

## 1. 저장소 개요 (초기 학습 이력)

- JS / TS 기반 풀스택 엔진 [Next.js](https://nextjs.org) 학습 기록 저장소입니다. Next.js는 React 위에 **파일 기반 라우팅 + 서버 렌더링 + Route Handler(API)** 를 한 프로젝트에 붙인 프레임워크입니다.
- 같은 워크스페이스의 `frontend_study/react/`(클라이언트 SPA)와 `backend_study/nest.js/`(API 서버)를 이미 다룬 전제에서, **그 둘을 한 저장소에서 어떻게 합치는지**를 배우는 것이 목표입니다. 나중에 Nest/Django API로 백엔드를 분리해도 되는 구조를 염두에 둡니다.
- React SPA와의 결정적 차이: SPA는 브라우저가 라우팅·데이터 페치를 전부 처리하고, Next.js는 **서버가 HTML/데이터 일부를 먼저 준비**합니다.
- 공통 스펙: **게시판(Posts) CRUD + 회원/인증**. `demo/`는 JSON 파일 저장소 → JWT 쿠키 인증 → Server Actions → 미들웨어 인가 순으로 점진적으로 발전합니다.
- 학습 목표와 전체 로드맵은 [Notion: Next.js](https://app.notion.com/p/Next-js-3d6d7dec5e2e81afb534c64042625cc6) 페이지를 기준으로 삼습니다.
- `study0.md`, `study1.md`, `study2.md`, ... 순서로 학습 진도가 진행됩니다. (숫자가 클수록 최신 진도)
  - `study0`: 실습 없이 이론만 (App Router, Server/Client Component, 렌더링 모델, SPA·Nest와의 비교)
  - `study1` ~ `study5`: Next.js 기본기 실습 (생성·명령어, App Router 라우팅, Server vs Client, 특수 파일·Route Handler, 데이터 페치와 게시판 CRUD)
  - `study6` ~ `study10`: 고급 기술 구현 (JWT 쿠키 인증, Server Actions, proxy 인가, 환경 변수·이미지·메타데이터, 빌드·배포)
  - `studyFinal`: 지금까지 배운 것을 응용하되 **구조를 다르게** 설계한 최종 미니 웹사이트 (학습 노트 앱, `src/` + feature 폴더 + `node:sqlite`)
- JSX와 TSX를 **같은 진도로 둘 다** 만듭니다.
  - `jsx_version/demo`, `jsx_version/project` — JavaScript (`.js` / `.jsx`)
  - `tsx_version/demo`, `tsx_version/project` — TypeScript (`.ts` / `.tsx`)
- `demo/`: study1~study10 문서 내용을 단계별로 하나씩 실습하며 누적되는 Next.js 프로젝트입니다. 커밋 히스토리를 따라가면 배운 순서 그대로 코드가 진화하는 것을 볼 수 있습니다.
- `project/`: `studyFinal.md`에 대응하는, `demo/`에서 익힌 개념을 전부 합쳐 처음부터 다른 구조로 완성한 독립된 미니 웹사이트입니다.

## 2. 작업 전 확인 사항

- 새 작업을 시작하기 전에 `studyN.md` 파일들을 번호 순서대로 확인하여 지금까지의 학습 진도와 맥락을 파악합니다.
- `jsx_version/`과 `tsx_version/`의 기능은 같아야 합니다. 한쪽에만 기능을 넣지 않습니다. 차이는 타입 어노테이션과 파일 확장자뿐입니다.
- `demo/`, `project/` 프로젝트 코드가 study 문서 설명과 어긋나지 않는지 확인합니다.
- 새 studyN.md 문서를 추가/수정할 때는 이전 study 문서와 이어지는 흐름을 유지합니다.
- `node_modules/`, `.next/`, `.env`(`.env.example` 제외)는 반드시 `.gitignore`에 포함되어 있어야 합니다.
- 코드를 고쳤으면 **커밋 전에 최소한 `npm run build` 또는 `npx next lint`/`npm run dev`로 확인**합니다. 가능하면 브라우저나 `curl`로 실제 응답을 확인한 뒤 커밋합니다.
- Next.js 개발 서버(`next dev`)는 파일 변경을 자동 반영합니다. 포트를 바꿔서 두 버전을 동시에 띄울 때는 `--port`를 명시합니다.
- 문서의 코드 예시는 기본적으로 **TSX**를 보여 주고, JSX는 타입이 빠지고 확장자만 `.js`/`.jsx`인 점을 본문에 명시합니다. 실제 코드는 두 버전 모두 존재해야 합니다.

## 3. 커밋 규칙

- 커밋 관련 규칙은 [COMMIT_GUIDE.md](./COMMIT_GUIDE.md) 문서를 따릅니다.

## 4. 언어 규칙

- 문서 내용, 커밋 설명: 한글
- 커밋 타입(prefix), 코드, 식별자, 파일명: 영어

## 5. 에이전트별 문서

- Claude: [.claude/CLAUDE.md](../.claude/CLAUDE.md)
- Grok: [.grok/GROK.md](../.grok/GROK.md)
- Codex: [.codex/AGENTS.md](../.codex/AGENTS.md)

## 6. 인수인계 원칙

- 작업을 마칠 때는 다음 에이전트/세션이 이어받을 수 있도록 변경 내용과 다음 단계 후보를 간단히 남깁니다.
- 불확실한 결정은 추측하지 말고 study 문서 내용과 [Notion 학습 목표 페이지](https://app.notion.com/p/Next-js-3d6d7dec5e2e81afb534c64042625cc6)를 근거로 삼습니다.
- 이 문서나 커밋 가이드에 없는 새로운 컨벤션이 필요해지면, 추측해서 각자 다르게 처리하지 말고 이 문서를 먼저 갱신합니다.
