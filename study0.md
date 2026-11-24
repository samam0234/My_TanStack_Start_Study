# study0 · 환경 설정

## 목표

Node.js 24와 Vite 기반 TanStack Start를 설치하고 새 프로젝트와 이 저장소를 각각 실행한다.

## 📖 이론

Node.js는 서버에서 JavaScript를 실행하고 npm은 의존성과 스크립트를 관리한다. Vite는 개발 서버와 빌드를 맡고 TanStack Start는 요청에 맞춰 HTML을 서버에서 렌더링한다(SSR). 라우트는 URL별 진입점, loader는 화면 전 데이터 준비, hydration은 서버 HTML에 브라우저 이벤트를 연결하는 과정이다. 식당에 비유하면 Vite는 연습 주방, SSR 결과는 미리 차린 상, hydration은 주문을 받을 준비다.

## 🛠️ 실기

1. Node.js 24를 설치하고 새 PowerShell에서 버전을 확인한다. Git도 함께 확인한다.
2. 공식 CLI를 빈 형제 디렉터리에서 실행한다. 설치 과정에서 React, TanStack Start, Vite, npm 구성을 선택한다. 새 디렉터리로 이동해 개발 서버를 실행한다.
3. 이 저장소에서는 `npm ci`로 잠금 파일을 사용한다. `.env.example`을 `.env`로 복사하고 로컬의 5173 포트와 SQLite를 사용한다.
4. `src/routes/`는 화면과 API 경로, `src/board/`는 화면 도구와 공유 스키마, `src/server/`는 DB·인증, `server/routes/`는 Nitro의 WebSocket, `scripts/`는 worker와 연동 실습이다.
5. VS Code에서 ESLint 설정을 추가하는 경우 ESLint(`dbaeumer.vscode-eslint`), 팀 서식을 맞추는 경우 Prettier(`esbenp.prettier-vscode`)를 선택해 설치한다. TypeScript·TSX는 내장 지원을 사용한다.

```powershell
node --version
npm --version
git --version
# 별도 빈 작업 디렉터리에서
npx @tanstack/cli@0.72.16 create ts-start-sandbox --framework react --build-tool vite --package-manager npm --blank --no-intent --no-git --yes
# 이 저장소에서
npm ci
npm ls @tanstack/react-start @tanstack/react-router vite
Copy-Item .env.example .env
npm run dev
# 새 프로젝트를 수동으로 시작했을 때
git init -b main
git check-ignore .env data/board.sqlite
```

### [vite.config.ts](vite.config.ts)

```ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'development') {
    for (const [key, value] of Object.entries(env)) process.env[key] ??= value
  }
  return {
    plugins: [tanstackStart(), nitro({ preset: 'node-server' }), react()],
  }
})
```

| 줄 | 설명 |
| --- | --- |
| 1–6 | Start, React, Nitro와 Vite 설정 API를 가져온다. |
| 7–10 | 개발 모드에서만 환경 파일을 읽고 이미 주입된 환경 변수를 우선한다. |
| 11–14 | Start 변환, Node용 Nitro, React 순으로 플러그인을 등록한다. |

### [.gitignore](.gitignore)

```text
node_modules/
.output/
.nitro/
.tanstack/
.env
.env.*
!.env.example
data/
coverage/
playwright-report/
test-results/
*.log
```

| 줄 | 설명 |
| --- | --- |
| 1–4 | 재설치할 수 있는 의존성과 빌드·개발 캐시를 제외한다. |
| 5–7 | 실제 시크릿 파일을 제외하고 예시 파일을 다시 포함한다. |
| 8–12 | 개인 DB, 업로드 및 테스트·로그 산출물을 Git에서 제외한다. |

## 🔗 연동 포인트

`.env`는 서버의 DB·인증 설정으로 이어진다. `.env.example`, 잠금 파일, 소스는 추적하고 실제 `.env`가 무시되는지 확인한다. 다음 단계에서 Vite 서버에 `/hello` 화면을 추가한다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| node 명령을 찾지 못함 | 설치 후 셸이 이전 PATH 사용 | 새 PowerShell을 열고 `node --version` 재실행 |
| 개발 URL이 달라짐 | 5173 포트가 이미 사용 중 | 터미널 URL을 확인하고 `APP_ORIGIN`과 `CORS_ORIGIN`을 실행 주소와 맞춘다. |

## 직접 해보기

1. 설치된 Node/npm/Start/Vite 버전을 기록한다.
2. 별도 폴더에서 공식 CLI로 생성하고 기본 화면을 띄운다.
3. `git check-ignore .env`와 `git ls-files .env.example`을 확인한다.

## ☐ 체크리스트

- [ ] 공식 Quick Start로 프로젝트 생성 (Vite 기반)
- [ ] 버전·개발 서버·Git·환경변수 추적 여부를 확인했다.

## 다음 단계

Vite가 띄운 서버에서 JSX를 이용한 첫 화면을 만든다. [study1](study1.md)

[공식 문서](https://tanstack.com/start/latest/docs/framework/react/getting-started)
