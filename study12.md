# study12 · 프론트·UI 연동

## 목표

Radix Dialog, Zustand, TanStack Form, TanStack Query를 게시판의 화면 경계에 연결한다.

## 📖 이론

Dialog는 대화상자의 접근성과 키보드 관리를 제공한다. Zustand는 보기 밀도 같은 UI 설정, TanStack Form은 일시적인 폼 입력, TanStack Query는 서버 조회와 재조회에 책임이 있다. 파일 트레이에서 입력 중 종이, 보관 자료, 화면 설정의 자리가 서로 다른 것과 같다.

## 🛠️ 실기

1. `/posts`에서 Zustand의 보기 옵션을 바꾸고 새로고침한다.
2. `/posts/new`의 `form.Field`, `form.Subscribe`, 필드 오류를 확인한다.
3. 상세에서 삭제 Dialog를 열고 Tab, Escape, 취소, 확인을 실행한다. `Dialog.Title`과 `Dialog.Description`을 화면에 둔다.
4. 생성·수정·삭제와 Page Link 클릭 때 Query가 최신 목록을 표시하는지 확인한다.

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
| 1–5 | 보기 상태 및 페이지 링크에 필요한 의존성을 가져온다. |
| 6–10 | 클라이언트 UI 선호값을 보관하는 작은 저장소를 만든다. |
| 11–17 | SSR 렌더와 브라우저 초기 렌더를 맞추고 이후 저장값을 읽는다. |
| 18–22 | 입력 이벤트를 상태와 localStorage에 반영한다. |
| 23–33 | 보기 옵션과 리스트 UI를 연결한다. |
| 34–39 | 글 요약과 타입 안전 매개변수 링크를 사용한다. |

### [src/routes/posts/$postId.tsx](src/routes/posts/$postId.tsx)

```tsx
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import { useRef, useState, type FormEvent } from 'react'
import { api, errorMessage, jsonRequest } from '../../board/client'
import type { Comment } from '../../board/contracts'
import { PostEditor } from '../../board/post-editor'
import { getPostDetail } from '../../board/server-functions'

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => {
    if (!/^\d+$/.test(params.postId)) throw notFound()
    const id = Number(params.postId)
    if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) throw notFound()
    return getPostDetail({ data: id })
  },
  notFoundComponent: () => <section><h1>게시글을 찾을 수 없습니다</h1><Link to="/posts">목록으로</Link></section>,
  component: Details,
})

function Details() {
  const post = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const queries = useQueryClient()
  const navigate = useNavigate()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')

  async function remove() {
    setDeleting(true)
    try {
      await api('/posts/' + post.id, { method: 'DELETE' })
      await queries.invalidateQueries({ queryKey: ['posts'] })
      await navigate({ to: '/posts' })
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setDeleting(false) }
  }

  return <article className="stack">
    <Link to="/posts">← 목록</Link>
    <h1>{post.title}</h1>
    <p className="muted">{post.author.nickname} · <time dateTime={post.createdAt}>{post.createdAt.slice(0, 10)}</time></p>
    <p className="post-body">{post.body}</p>
    {post.tags.length > 0 && <p>{post.tags.map((tag) => '#' + tag).join(' ')}</p>}
    {user?.id === post.author.id && <div className="actions">
      <button onClick={() => setEditing(!editing)}>{editing ? '편집 닫기' : '편집'}</button>
      <Dialog.Root>
        <Dialog.Trigger asChild><button className="secondary">삭제</button></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog stack">
            <Dialog.Title>게시글 삭제</Dialog.Title>
            <Dialog.Description>게시글과 댓글을 삭제합니다.</Dialog.Description>
            {message && <p role="alert" className="error">{message}</p>}
            <div className="actions">
              <Dialog.Close asChild><button className="secondary">취소</button></Dialog.Close>
              <button className="danger" disabled={deleting} onClick={() => void remove()}>삭제 확인</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>}
    {editing && <PostEditor key={post.updatedAt} post={post} onSaved={async () => {
      await router.invalidate()
      setEditing(false)
    }} />}
    <Comments key={post.id} postId={post.id} userId={user?.id} />
  </article>
}

function Comments({ postId, userId }: { postId: number; userId?: number }) {
  const queries = useQueryClient()
  const key = ['comments', postId] as const
  const comments = useQuery({ queryKey: key, queryFn: () => api<{ data: Comment[] }>('/posts/' + postId + '/comments') })
  const [body, setBody] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const locked = useRef(false)

  async function change(action: () => Promise<unknown>) {
    if (locked.current) return
    locked.current = true
    setPending(true)
    setMessage('')
    try {
      await action()
      await Promise.all([queries.invalidateQueries({ queryKey: key }), queries.invalidateQueries({ queryKey: ['posts'] })])
    } catch (error) { setMessage(errorMessage(error)) }
    finally { locked.current = false; setPending(false) }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void change(async () => {
      await api('/posts/' + postId + '/comments', jsonRequest('POST', { body }))
      setBody('')
    })
  }

  return <section className="stack panel">
    <h2>댓글</h2>
    {comments.isError && <p role="alert" className="error">{errorMessage(comments.error)}</p>}
    {comments.isPending && <p role="status">댓글을 불러오는 중입니다.</p>}
    {comments.data?.data.map((comment) => <div className="comment" key={comment.id}>
      <strong>{comment.author.nickname}</strong><p className="post-body">{comment.body}</p>
      {comment.author.id === userId && <button className="secondary" disabled={pending}
        onClick={() => void change(() => api('/comments/' + comment.id, { method: 'DELETE' }))}>댓글 삭제</button>}
    </div>)}
    {userId && <form className="stack" onSubmit={submit}>
      <label>댓글 내용<textarea value={body} required maxLength={1000} onChange={(event) => setBody(event.target.value)} /></label>
      <button type="submit" disabled={pending}>댓글 작성</button>
    </form>}
    {message && <p role="alert" className="error">{message}</p>}
  </section>
}
```

| 줄 | 설명 |
| --- | --- |
| 1–9 | Radix와 라우터, 댓글 조회, 공통 편집 UI를 가져온다. |
| 10–20 | 요청된 글 번호와 상세의 notFound 흐름을 정의한다. |
| 21–40 | 작성자 전용 편집과 삭제 API를 묶는다. |
| 41–72 | 본문과 작성자 버튼을 표시하고 Dialog Trigger·Content·Title·Description을 연결한다. |
| 73–101 | 댓글 Query와 제출·삭제 잠금, 화면 오류를 분리한다. |
| 102–117 | 댓글과 작성 폼을 표시하고 상태를 접근 가능한 텍스트로 알려준다. |

## 🔗 연동 포인트

삭제 Dialog의 전체 구현은 `src/routes/posts/$postId.tsx`, 편집 폼 전체는 `src/board/post-editor.tsx` 및 study5에 있다. 폼 성공 후 서버 캐시가 갱신되며 보기 설정은 그대로 유지된다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 열었는데 포커스가 이동하지 않음 | Dialog Trigger 또는 Content 연결 누락 | Trigger/Portal/Title/Description을 유지하고 키보드로 확인한다. |
| 수정 뒤 예전 목록 | 서버 조회 캐시 무효화 누락 | `invalidateQueries({queryKey:['posts']})`를 호출한다. |

## 직접 해보기

1. Dialog를 키보드만으로 열고 취소한다.
2. 폼을 비우고 저장하여 필드 안내를 확인한다.
3. 보기 밀도를 바꾼 뒤 새로고침하고 게시글 검색이 유지되는지 확인한다.

## ☐ 체크리스트

- [ ] UI 프리미티브, 브라우저 상태, 폼, 서버 캐시의 데이터 위치를 설명할 수 있다.
- [ ] 오류 UI와 포커스 순서를 점검했다.

## 다음 단계

내 계정과 문서 화면을 결제·메일·OAuth·업로드에 연결한다. [study13](study13.md)

[공식 문서](https://www.radix-ui.com/primitives/docs/components/dialog)
