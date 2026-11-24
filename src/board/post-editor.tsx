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
