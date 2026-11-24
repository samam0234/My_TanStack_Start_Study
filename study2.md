# study2 · 핵심 구조와 조립

## 목표

`__root.tsx`의 공통 문서 틀에 파일 라우트와 재사용 컴포넌트를 연결한다.

## 📖 이론

파일 라우트는 URL과 화면 수명주기를 묶는다. 루트는 HTML과 공통 내비게이션을 만들고 Outlet이 자식 라우트의 자리를 맡는다. 목록 화면은 props로 글 배열을 내려 보내고 입력 이벤트의 콜백을 통해 표시 상태를 바꾼다. 한 건물의 현관과 각 방을 떠올리면 루트는 공용 출입구이고 Outlet은 방이 들어가는 자리다.

## 🛠️ 실기

1. 루트 파일의 `shellComponent`, `component`, `Outlet`을 찾는다.
2. 목록의 `PostList`와 각 `PostRow`가 넘겨받는 props를 확인한다.
3. 체크박스의 `onChange`가 `changeDensity`를 호출하는 경로를 따라간다. `routeTree.gen.ts`는 개발 서버와 빌드가 갱신한다.

### [src/routes/__root.tsx](src/routes/__root.tsx)

```tsx
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import { getViewer } from '../board/server-functions'
import styles from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'TanStack Start 게시판' }],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  beforeLoad: async () => ({ user: await getViewer() }),
  component: Root,
  notFoundComponent: () => <section><h1>페이지를 찾을 수 없습니다</h1><Link to="/posts">게시판으로</Link></section>,
  errorComponent: ({ reset }) => <section><h1>화면을 불러오지 못했습니다</h1><button onClick={reset}>다시 시도</button></section>,
  shellComponent: ({ children }) => (
    <html lang="ko">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  ),
})

function Root() {
  const { user } = Route.useRouteContext()
  return <>
    <header className="site-header">
      <nav className="shell nav" aria-label="주 메뉴">
        <Link to="/" className="brand">TanStack Start</Link>
        <div>
          <Link to="/posts">게시판</Link>
          {user ? <><Link to="/documents">문서 실습</Link><Link to="/account">내 계정</Link></>
            : <Link to="/login">로그인</Link>}
        </div>
      </nav>
    </header>
    <main className="shell"><Outlet /></main>
  </>
}
```

| 줄 | 설명 |
| --- | --- |
| 1–5 | 라우터와 Query 타입, 뷰어 및 CSS 자산을 가져온다. |
| 6–23 | QueryClient 컨텍스트, 문서 헤더, 뷰어, 오류 경계 및 HTML 껍데기를 지정한다. |
| 24–39 | 인증 상태에 맞는 링크를 만든 뒤 Outlet에 하위 페이지를 배치한다. |

### [src/board/post-list.tsx](src/board/post-list.tsx)

```tsx
import { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { create } from 'zustand'
import type { PostSummary } from './contracts'

const useDensity = create<{ compact: boolean; setCompact: (compact: boolean) => void }>((set) => ({
  compact: false,
  setCompact: (compact) => set({ compact }),
}))

export function PostList({ posts }: { posts: PostSummary[] }) {
  const { compact, setCompact } = useDensity()

  useEffect(() => {
    try { setCompact(localStorage.getItem('board-density') === 'compact') } catch { /* storage is optional */ }
  }, [setCompact])

  function changeDensity(next: boolean) {
    setCompact(next)
    try { localStorage.setItem('board-density', next ? 'compact' : 'comfortable') } catch { /* optional */ }
  }

  return <>
    <label className="checkbox">
      <input type="checkbox" checked={compact} onChange={(event) => changeDensity(event.target.checked)} /> 간단히 보기
    </label>
    {posts.length === 0 ? <p className="empty">표시할 글이 없습니다.</p> :
      <ul className={compact ? 'post-list compact' : 'post-list'}>
        {posts.map((post) => <PostRow key={post.id} post={post} />)}
      </ul>}
  </>
}

function PostRow({ post }: { post: PostSummary }) {
  return <li>
    <Link to="/posts/$postId" params={{ postId: String(post.id) }}>{post.title}</Link>
    <span>{post.author.nickname} · 댓글 {post.commentCount} · <time dateTime={post.createdAt}>{post.createdAt.slice(0, 10)}</time></span>
  </li>
}
```

| 줄 | 설명 |
| --- | --- |
| 1–5 | 링크, 효과, 상태 저장소와 글 목록 타입을 연결한다. |
| 6–10 | 목록 표시 상태와 변경 함수를 제공한다. |
| 11–33 | 부모의 posts props와 체크박스 콜백을 연결한다. |
| 34–39 | 한 글의 제목, 작성자, 댓글 수, 날짜와 동적 링크를 렌더링한다. |

## 🔗 연동 포인트

루트 컨텍스트가 로그인 정보를 하위 라우트로 전달한다. 목록 타입은 API의 목록 요약과 같고, 로컬 화면 기호는 study3에서 분리한다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 상단 메뉴만 표시됨 | 루트에 Outlet이 빠짐 | `<main>` 안에 Outlet을 되돌린다. |
| 라우트 타입이 갱신되지 않음 | 생성기 파일이 오래됨 | Vite를 다시 실행하고 생성 파일을 확인한다. |

## 직접 해보기

1. `PostRow`에 글 제목을 감싼 요소를 추가한다.
2. `/hello`와 `/posts`를 오가며 공통 메뉴를 확인한다.
3. 체크박스 이벤트가 어느 함수에서 처리되는지 추적한다.

## ☐ 체크리스트

- [ ] 파일 기반 라우트와 루트 레이아웃 (`__root.tsx`)
- [ ] props와 이벤트 전달을 추적했다.

## 다음 단계

표시 상태를 브라우저 저장소에 연결하고 서버 데이터와 구분한다. [study3](study3.md)

[공식 문서](https://tanstack.com/start/latest/docs/framework/react/guide/routing)
