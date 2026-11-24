# Claude 전용 인수인계 문서

공통 규칙은 [../.agent/AGENTS.md](../.agent/AGENTS.md) 및 [../.agent/COMMIT_GUIDE.md](../.agent/COMMIT_GUIDE.md)를 먼저 확인하고 따릅니다.
이 문서에는 Claude를 사용할 때만 해당하는 특이사항을 기록합니다.

## Claude 관련 참고 사항

- Next.js는 Node.js 위에서 동작합니다. 이 저장소 작업 시점의 확인 버전은 Node `v24.x`, npm `11.x`입니다. `node -v`가 안 되면 셸을 새로 열거나 nvm/fnm PATH를 확인합니다.
- `create-next-app`은 이미 Git 저장소인 이 폴더 안에서 쓰므로 **반드시 `--disable-git`** 을 붙입니다. 안 그러면 `demo/` 안에 중첩 `.git`이 생깁니다.
- JSX와 TSX를 동시에 유지합니다. 기능을 추가할 때는 `tsx_version/`을 기준으로 구현한 뒤, 타입만 제거해 `jsx_version/`에 같은 파일을 만듭니다. 파일 확장자: TS는 `page.tsx` / `route.ts`, JS는 `page.jsx` / `route.js`.
- Next.js 16 App Router에서는 `cookies()`, `headers()`, `params`, `searchParams`가 **async**입니다. 동기 API를 쓰지 않습니다.
- **Windows PowerShell 5.1의 `Get-Content -Raw` / `Set-Content`로 소스 파일을 편집하지 마세요.** `Get-Content`가 BOM 없는 UTF-8 파일을 시스템 ANSI 코드페이지로 읽어버려서 한글 주석이 전부 깨집니다. 파일 수정은 Edit/Write 도구를 쓰거나, 최소한 `-Encoding utf8`을 읽기/쓰기 양쪽에 모두 지정해야 합니다.
- curl로 한글이 포함된 JSON body를 보낼 때 Windows 터미널 코드페이지 문제로 인코딩이 깨질 수 있습니다. smoke test에는 영어 payload를 쓰고, 한글 검증은 UTF-8 파일을 `curl --data-binary @file.json`으로 넘깁니다.
- `next dev`가 이미 떠 있는 포트에 다시 띄우면 실패합니다. JSX는 `3000`, TSX는 `3001`처럼 포트를 나누거나, 재실행 전에 기존 프로세스를 종료합니다.
- 같은 워크스페이스의 `frontend_study/react/`와 `backend_study/nest.js/`와 커리큘럼이 대응되므로, 개념 설명 시 "React Router의 `<Route>` ≈ App Router의 폴더", "Nest의 Controller ≈ Route Handler `app/api`", "Vite SPA의 클라이언트 페치 ≈ Server Component의 서버 페치" 식으로 비교하면 사용자의 기존 지식과 연결됩니다.
- Next.js 메이저 버전(15 → 16)마다 기본 스캐폴드와 캐시 API가 바뀝니다. 답변/코드 작성 전에 `package.json`의 `next` 버전을 먼저 확인합니다.
