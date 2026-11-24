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
