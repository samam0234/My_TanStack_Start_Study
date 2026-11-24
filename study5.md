# study5 · 폼·입력·검증

## 목표

글 작성·수정 폼에서 필드 검증, 오류 표시, 중복 제출 방지를 구현한다.

## 📖 이론

폼 라이브러리가 입력과 제출 상태를 모으고 Zod 스키마가 서버에서도 값의 제약을 검사한다. `ref`는 첫 비동기 처리 시작과 다음 렌더 사이의 중복 클릭을 막는다. 비유하면 브라우저 검증은 접수창구에서의 확인이고 서버 검증은 문서가 실제로 통과하는 심사다.

## 🛠️ 실기

1. 로그인 후 `/posts/new`를 열고 빈 제목으로 저장한다. 화면의 필드 오류를 확인한다.
2. 정상 글을 저장하고 Network에서 POST의 201을 확인한다. 상세에서 수정 저장은 PATCH와 200으로 이어진다.
3. API에 잘못된 JSON이나 빈 제목을 보내고 공통 v1 `400`을 읽는다. 문서 질문의 길이 오류는 확장 API에서 `422`와 `fields.question`으로 표시한다.

### [src/board/post-editor.tsx](src/board/post-editor.tsx)

```tsx
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { api, ClientError, errorMessage, jsonRequest } from './client'
import { postInput, type Post } from './contracts'

export function PostEditor({ post, onSaved }: { post?: Post; onSaved?: () => Promise<void> }) {
  const navigate = useNavigate()
  const queries = useQueryClient()
  const submitting = useRef(false)
  const [fields, setFields] = useState<Record<string, string[]>>({})
  const [message, setMessage] = useState('')
  const form = useForm({
    defaultValues: { title: post?.title ?? '', body: post?.body ?? '', tags: post?.tags.join(', ') ?? '' },
    onSubmit: async ({ value }) => {
      if (submitting.current) return
      submitting.current = true
      setFields({})
      setMessage('')
      try {
        const input = { title: value.title, body: value.body, tags: value.tags.split(',').map((tag) => tag.trim()).filter(Boolean) }
        const parsed = postInput.safeParse(input)
        if (!parsed.success) {
          const errors = parsed.error.flatten().fieldErrors
          setFields(errors)
          setMessage('입력값을 확인하세요.')
          return
        }
        const { data } = await api<{ data: Post }>(post ? '/posts/' + post.id : '/posts',
          jsonRequest(post ? 'PATCH' : 'POST', parsed.data))
        await queries.invalidateQueries({ queryKey: ['posts'] })
        if (onSaved) await onSaved()
        else await navigate({ to: '/posts/$postId', params: { postId: String(data.id) } })
      } catch (error) {
        if (error instanceof ClientError) setFields(error.details.fields ?? {})
        setMessage(errorMessage(error))
      } finally {
        submitting.current = false
      }
    },
  })

  return <form className="stack panel" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit() }}>
    <form.Field name="title">{(field) => <label>제목
      <input value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} aria-invalid={!!fields.title} />
      {fields.title && <span className="error">{fields.title.join(' ')}</span>}
    </label>}</form.Field>
    <form.Field name="body">{(field) => <label>본문
      <textarea value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} aria-invalid={!!fields.body} rows={7} />
      {fields.body && <span className="error">{fields.body.join(' ')}</span>}
    </label>}</form.Field>
    <form.Field name="tags">{(field) => <label>태그 (쉼표로 구분)
      <input value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} aria-invalid={!!fields.tags} />
      {fields.tags && <span className="error">{fields.tags.join(' ')}</span>}
    </label>}</form.Field>
    {message && <p className="error" role="alert">{message}</p>}
    <form.Subscribe selector={(state) => state.isSubmitting}>{(pending) =>
      <button disabled={pending} type="submit">{pending ? '저장 중' : '저장'}</button>
    }</form.Subscribe>
  </form>
}
```

| 줄 | 설명 |
| --- | --- |
| 1–7 | 폼 상태, 캐시, 이동 함수 및 공통 스키마를 가져온다. |
| 8–15 | 신규·수정에 맞는 초기값과 제출 잠금을 준비한다. |
| 16–43 | 태그를 배열로 변환하고 스키마를 검사한다. API 응답 후 캐시를 무효화하고 상세를 갱신한다. |
| 44–62 | 라벨·입력·필드 안내를 바인딩하고 제출 상태 동안 저장 버튼을 잠근다. |

### [src/board/client.ts](src/board/client.ts)

```ts
import type { ErrorBody } from './contracts'

export class ClientError extends Error {
  constructor(readonly status: number, readonly details: ErrorBody) { super(details.message) }
}

export async function checkedFetch(path: string, init?: RequestInit) {
  const response = await fetch(path, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new ClientError(response.status, body?.error ?? {
      code: 'HTTP_ERROR', message: '요청을 완료할 수 없습니다.', requestId: response.headers.get('X-Request-Id') ?? '',
    })
  }
  return response
}

export function jsonRequest(method: string, data: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(data) }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await checkedFetch('/api' + path, init)
  return response.status === 204 ? undefined as T : response.json()
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '연결을 확인하세요.'
}
```

| 줄 | 설명 |
| --- | --- |
| 1–2 | 오류 응답 타입을 공용 스키마에서 가져온다. |
| 3–6 | HTTP 상태 코드와 오류 본문을 함께 보존한다. |
| 7–17 | 실패 응답을 읽어 필드와 요청 ID가 있는 오류로 바꾼다. |
| 18–21 | JSON 헤더와 바디를 만든다. |
| 22–26 | 공통 API 접두어를 붙이고 204의 빈 본문을 처리한다. |
| 27–29 | 알 수 없는 오류에도 읽을 수 있는 문구를 제공한다. |

## 🔗 연동 포인트

POST/PATCH는 공통 `/api/posts`에 연결하고, 성공 시 Query의 `posts` 캐시를 무효화한다. 문서 답변 폼은 별도 확장 API의 422도 처리한다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 빈 입력이 저장됨 | 서버 검증 누락 | API가 `valid(postInput, input)`을 실행하는지 확인한다. |
| 204 응답에서 JSON 오류 | 본문 없는 응답을 `json()`으로 읽음 | 응답 코드가 204면 값 없이 끝낸다. |
| 버튼을 연속 클릭해 두 번 전송 | 최초 렌더 사이에 저장이 재진입 | 동기 ref와 제출 중 disabled를 유지한다. |

## 직접 해보기

1. 서버에 보낼 제목을 빈 값으로 만들어 400의 `error.fields`를 확인한다.
2. 작성과 수정을 차례로 실행해 201과 200을 확인한다.
3. 문서 질문 API에 501자 질문을 보내 422를 확인한다.

## ☐ 체크리스트

- [ ] 브라우저 입력과 서버 필드 오류를 확인했다.
- [ ] 200·201·400·422 분기와 중복 제출 잠금을 설명할 수 있다.

## 다음 단계

서버가 받은 폼 요청을 SQLite CRUD와 공통 API 응답에 연결한다. [study6](study6.md)

[공식 문서](https://tanstack.com/form/latest/docs/framework/react/overview)
