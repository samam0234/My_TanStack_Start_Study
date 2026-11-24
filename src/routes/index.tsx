import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <section className="hero">
      <h1>TanStack Start 게시판</h1>
      <p>게시글을 검색하고, 로그인해 글과 댓글을 남겨 보세요.</p>
      <div className="actions">
        <Link className="button" to="/posts">게시판 열기</Link>
        <a href="/api-docs">API 문서</a>
      </div>
    </section>
  )
}
