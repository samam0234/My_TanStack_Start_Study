import { createFileRoute, Link, useNavigate, type SearchSchemaInput } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { validateSearch, type Search } from '../../board/contracts'
import { LiveUpdates } from '../../board/live'
import { PostList } from '../../board/post-list'
import { postsQuery } from '../../board/server-functions'

export const Route = createFileRoute('/posts/')({
  validateSearch: (raw: Partial<Search> & SearchSchemaInput) => validateSearch(raw),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(postsQuery(deps)),
  component: Posts,
})

function Posts() {
  const search = Route.useSearch()
  const { user } = Route.useRouteContext()
  const { data: { data, meta } } = useSuspenseQuery(postsQuery(search))
  return <section>
    <div className="section-heading">
      <div><h1>게시판</h1><LiveUpdates /></div>
      {user ? <Link className="button" to="/posts/new">글쓰기</Link>
        : <Link to="/login">로그인하고 글쓰기</Link>}
    </div>
    <SearchForm key={search.q + search.sort} />
    <p className="muted">총 {meta.total}개</p>
    <PostList posts={data} />
    <nav className="actions" aria-label="페이지 이동">
      {meta.page > 1 && <Link to="/posts" search={{ ...search, page: meta.page - 1 }}>이전</Link>}
      <span>{meta.page} / {Math.max(1, meta.totalPages)} 페이지</span>
      {meta.page < meta.totalPages && <Link to="/posts" search={{ ...search, page: meta.page + 1 }}>다음</Link>}
    </nav>
  </section>
}

function SearchForm() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/posts/' })
  const [q, setQuery] = useState(search.q)
  const [sort, setSort] = useState(search.sort)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void navigate({ search: { ...search, q, sort, page: 1 } })
  }

  return <form className="search" onSubmit={submit}>
    <label>검색어<input value={q} onChange={(event) => setQuery(event.target.value)} maxLength={200} /></label>
    <label>정렬<select value={sort} onChange={(event) => setSort(validateSearch({ sort: event.target.value }).sort)}>
      <option value="-createdAt">최신순</option><option value="createdAt">오래된순</option><option value="-commentCount">댓글순</option>
    </select></label>
    <button type="submit">검색</button>
  </form>
}
