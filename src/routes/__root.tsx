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
