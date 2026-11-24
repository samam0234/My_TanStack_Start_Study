# study3 · 데이터와 상태

## 목표

글 데이터, URL 검색 상태, 브라우저 표시 설정의 저장 위치를 결정한다.

## 📖 이론

글과 댓글은 서버 DB가 원본이고 `PostSummary`가 화면에서 쓰는 모델이다. 검색 조건은 URL에 있어야 공유하거나 새로고침할 수 있다. 보기 밀도는 브라우저에만 필요한 상태라서 Zustand와 localStorage를 사용한다. 게시판 원본이 서류철이라면 URL은 찾아보기 색인, localStorage는 내 자리의 화면 설정이다.

## 🛠️ 실기

1. `/posts`에서 «간단히 보기» 체크박스를 바꾼다.
2. DevTools Application → Local Storage에서 `board-density`를 살펴보고 새로고침한다.
3. `validateSearch`가 `page`, `limit`, `q`, `sort`에 기본값과 범위를 부여하는 과정도 확인한다.

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
| 1–5 | React 효과 및 읽기 전용 모델 타입을 가져온다. |
| 6–13 | 초깃값과 setter를 정의한다. |
| 14–17 | 브라우저에서 저장된 표시 상태를 읽는다. SSR에서는 기본 상태로 시작한다. |
| 18–22 | 입력 변경을 화면 상태에 반영하고 브라우저 저장소에 기록한다. |
| 23–33 | 배열을 화면에 바인딩하고 표시 조건을 반영한다. |
| 34–39 | 모델에서 필요한 필드만 선택해 화면에 표시한다. |

## 🔗 연동 포인트

게시글은 study6 DB에 저장하고, 사용자 인증 토큰은 study7에서 httpOnly 쿠키로 다룬다. 검색어는 study4에서 URL을 통해 공유한다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 서버에서 `localStorage`가 정의되지 않음 | SSR 렌더 중 브라우저 API 호출 | 읽기를 `useEffect` 안으로 옮긴다. |
| 새로고침 후 설정 초기화 | 저장소 사용 거부 또는 키 불일치 | Application의 현재 Origin과 `board-density` 키를 확인한다. |

## 직접 해보기

1. 다른 브라우저 프로필과 표시 설정이 섞이지 않는지 확인한다.
2. DevTools로 `board-density`를 지우고 기본 표시를 확인한다.
3. URL의 `page`를 바꾸어 화면 설정과 별개로 동작하는지 확인한다.

## ☐ 체크리스트

- [ ] 보기 설정이 새로고침 후에도 유지된다.
- [ ] 글, URL, 화면 설정의 원본을 설명할 수 있다.

## 다음 단계

타입 안전한 검색 조건과 동적 경로를 loader에 전달한다. [study4](study4.md)

[공식 문서](https://tanstack.com/router/latest/docs/framework/react/guide/search-params)
