# study4 · 라우팅과 요청 처리

## 목표

목록과 동적 상세, 서버 함수, HTTP API가 각각 요청을 처리하는 경로를 확인한다.

## 📖 이론

파일 기반 라우팅은 경로를 파일 이름에 매핑한다. `$postId`는 경로 변수이고 `?page=2&q=hello`는 화면 상태를 담은 검색 문자열이다. loader는 화면을 열기 전에 데이터를 얻는다. `createServerFn` 호출은 서버에서 DB를 읽고 UI로 결과를 돌려준다. 주소가 우편함 번호라면 검색 조건은 우편물 분류표다.

## 🛠️ 실기

1. `/posts?q=sqlite&page=1`을 열어 `validateSearch`와 `loaderDeps`를 따라간다.
2. 글 링크에서 `/posts/$postId`의 `params.postId`를 확인한다. 존재하지 않는 경로와 글 ID는 404 화면으로 연결된다.
3. `/api/posts/1`은 같은 DB 서비스의 상세 JSON을 반환한다. API에서는 숫자 ID 형식이 잘못되면 400을 반환한다.

```powershell
curl.exe -i 'http://localhost:5173/posts?q=sqlite&page=1'
curl.exe -i 'http://localhost:5173/api/posts/not-a-number'
curl.exe -i 'http://localhost:5173/posts/999999'
```

### [src/routes/posts/index.tsx](src/routes/posts/index.tsx)

```tsx
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
```

| 줄 | 설명 |
| --- | --- |
| 1–8 | 타입 안전 내비게이션, Query와 검색 검증기를 준비한다. |
| 9–15 | 검색값을 정규화하고 캐시를 loader에서 채운다. |
| 16–36 | URL 검색, 캐시 응답의 data/meta와 페이지 링크를 사용한다. |
| 37–55 | 입력 중인 값은 임시 상태로 관리하고 제출 시 검색과 페이지를 갱신한다. |

### [src/board/server-functions.ts](src/board/server-functions.ts)

```ts
import { queryOptions } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { validateSearch } from './contracts'
import type { Search } from './contracts'
import { viewer } from '../server/board-api'
import { database } from '../server/database'
import { ApiError } from '../server/errors'
import { getPost, listPosts } from '../server/posts'

export const getViewer = createServerFn({ method: 'GET' }).handler(() => {
  setResponseHeader('Cache-Control', 'private, no-store')
  return viewer(getRequest())
})

export const getPosts = createServerFn({ method: 'GET' })
  .validator((data: Search) => validateSearch(data))
  .handler(async ({ data }) => listPosts(await database(), data))

export const getPostDetail = createServerFn({ method: 'GET' })
  .validator(z.number().int().min(1).max(2_147_483_647))
  .handler(async ({ data }) => {
    try { return await getPost(await database(), data) }
    catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound()
      throw error
    }
  })

export function postsQuery(search: Search) {
  return queryOptions({ queryKey: ['posts', search], queryFn: () => getPosts({ data: search }) })
}
```

| 줄 | 설명 |
| --- | --- |
| 1–12 | 서버 함수, 검증기 및 DB 접근을 가져온다. |
| 13–17 | 현재 요청의 뷰어를 서버에서 확인한다. |
| 18–21 | 검색 입력을 검증하고 게시글 목록을 조회한다. |
| 22–31 | 상세 ID를 검증하고 DB의 404를 화면의 notFound로 연결한다. |
| 32–34 | 동일 검색의 캐시 키와 서버 함수 조회를 묶는다. |

## 🔗 연동 포인트

화면의 `/posts/$postId`와 API의 `/api/posts/{id}`는 같은 식별자를 사용한다. study6에서 공통 응답을, study15에서 Query 키와 갱신을 자세히 다룬다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 검색을 바꿔도 목록이 같음 | loaderDeps에 검색을 전달하지 않음 | 정규화된 search를 loaderDeps와 queryKey에 포함한다. |
| `undefined` ID 요청 | 경로의 params 누락 | Link에 `params={{ postId: String(id) }}`를 넘긴다. |
| 주소는 바뀌는데 오류 화면이 안 나옴 | 404를 일반 Error로 던짐 | 상세의 notFound와 서비스 404 변환을 확인한다. |

## 직접 해보기

1. 검색 페이지 링크를 복사해 새 탭에서 동일한 목록을 확인한다.
2. API의 잘못된 ID와 존재하지 않는 ID 응답을 비교한다.
3. `q`와 `page` 값을 바꾸며 Network 탭을 확인한다.

## ☐ 체크리스트

- [ ] 라우트 `loader`로 게시판 목록 불러오기
- [ ] `validateSearch`로 page, q 검색 파라미터를 타입 검사
- [ ] 동적 상세, 페이지 이동, 404를 확인했다.

## 다음 단계

주소에서 읽던 데이터 흐름에 서버로 보내는 입력 폼을 더한다. [study5](study5.md)

[공식 문서](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
