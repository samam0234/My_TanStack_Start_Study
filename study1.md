# study1 · Hello World와 기본 문법

## 목표

`/hello`에서 JSX 보간, 조건 렌더링, 배열 렌더링을 확인한다.

## 📖 이론

JSX는 TypeScript 코드에서 화면 구조를 표현하는 문법이다. 중괄호 안에 JavaScript 표현식을 넣고 목록에는 동일 항목을 추적할 수 있는 key를 준다. 컴포넌트는 빈 칸을 채울 수 있는 서식이고 JSX 중괄호는 그 서식의 빈 칸이다.

## 🛠️ 실기

1. `src/routes/hello.tsx`를 만든다.
2. `http://localhost:5173/hello`를 연다. `name`을 바꾸고 Vite의 빠른 화면 업데이트를 확인한다.
3. DevTools Elements에서 `h1`과 `li`를 찾는다. Network에서 Document 응답과 JS 요청을 보고 Console 오류를 확인한다.

```powershell
npm run dev
curl.exe -i http://localhost:5173/hello
```

### [src/routes/hello.tsx](src/routes/hello.tsx)

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/hello')({ component: Hello })

function Hello() {
  const name = 'TanStack Start'
  const topics = ['라우팅', '서버 렌더링']
  return (
    <section>
      <h1>Hello, {name}!</h1>
      {topics.length > 0 && <ul>{topics.map((topic) => <li key={topic}>{topic}</li>)}</ul>}
    </section>
  )
}
```

| 줄 | 설명 |
| --- | --- |
| 1–2 | 파일 경로를 라우트 객체에 연결할 함수를 가져온다. |
| 3–4 | `/hello`에 페이지 컴포넌트를 등록한다. |
| 5–7 | 이름 문자열과 항목 배열을 준비한다. |
| 8–14 | 중괄호 보간, `&&` 조건, `map`과 key로 JSX를 만든다. |

## 🔗 연동 포인트

초기 HTTP 응답에는 SSR HTML이 포함된다. 후속 파일 변경은 Vite HMR로 확인한다. 첫 화면을 루트 레이아웃과 화면 컴포넌트로 나누는 작업은 study2에서 이어진다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `/hello`가 404 | 경로 이름·파일 위치 불일치 | `src/routes/hello.tsx`, 선언 경로와 서버 재생성을 확인한다. |
| 목록 key 경고 | `map` 결과에 key 누락 | 각 항목에 고유한 key를 지정한다. |

## 직접 해보기

1. `name`에 자기 별명을 넣어 HMR을 확인한다.
2. 항목 배열을 비우고 `ul`이 없어지는지 확인한다.
3. Network의 Document 응답에서 `Hello`를 검색한다.

## ☐ 체크리스트

- [ ] 첫 SSR 응답과 JSX 화면을 확인했다.
- [ ] 개발자도구에서 HTML·요청·콘솔을 확인했다.

## 다음 단계

루트와 게시판 화면을 나누고 props와 콜백으로 연결한다. [study2](study2.md)

[공식 문서](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch)
