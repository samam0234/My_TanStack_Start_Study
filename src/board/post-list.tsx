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
