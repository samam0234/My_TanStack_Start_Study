import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, checkedFetch, ClientError, errorMessage, jsonRequest } from '../board/client'

type Document = { id: string; filename: string; status: 'queued' | 'working' | 'ready' | 'failed' }

export const Route = createFileRoute('/documents')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/login' })
    return { user: context.user }
  },
  component: DocumentsRoute,
})

function DocumentsRoute() {
  const { user } = Route.useRouteContext()
  return <Documents key={user.id} userId={user.id} />
}

function Documents({ userId }: { userId: number }) {
  const client = useQueryClient()
  const documentsKey = ['documents', userId]
  const documents = useQuery({
    queryKey: documentsKey,
    queryFn: () => api<{ data: Document[] }>('/documents'),
    refetchInterval: (query) => query.state.data?.data.some((doc) => doc.status === 'queued' || doc.status === 'working') ? 1000 : false,
  })
  const [id, setId] = useState('')
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const running = useRef<AbortController | null>(null)
  useEffect(() => () => running.current?.abort(), [])

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (running.current) return
    const controller = new AbortController()
    running.current = controller
    setPending(true)
    setMessage('')
    try { await action(controller.signal) }
    catch (error) {
      if (!controller.signal.aborted) {
        setMessage(error instanceof ClientError && error.status === 422
          ? error.details.fields?.question?.join(' ') || error.message : errorMessage(error))
      }
    } finally {
      running.current = null
      setPending(false)
    }
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = new FormData(form).get('file')
    if (!(file instanceof File) || !file.name) return
    void run(async (signal) => {
      const { data } = await api<{ data: Document }>('/documents?filename=' + encodeURIComponent(file.name),
        { method: 'POST', body: file, signal })
      setId(data.id)
      setResult('')
      form.reset()
      await client.invalidateQueries({ queryKey: documentsKey })
    })
  }

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(async (signal) => {
      setResult('')
      const response = await checkedFetch('/api/documents/' + id + '/answer', { ...jsonRequest('POST', { question }), signal })
      const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader()
      if (!reader) throw new Error('응답 본문을 읽을 수 없습니다.')
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          setResult((text) => text + value)
        }
      } finally { reader.releaseLock() }
    })
  }

  const ready = documents.data?.data.find((doc) => doc.id === id)?.status === 'ready'
  return <section className="stack">
    <h1>문서 요약과 질문</h1>
    <form className="panel stack" onSubmit={upload}>
      <label>UTF-8 문서 (TXT·MD, 32 KiB 이하)<input type="file" name="file" accept=".txt,.md" required /></label>
      <button type="submit" disabled={pending}>업로드</button>
    </form>
    {documents.isError && <p role="alert" className="error">{errorMessage(documents.error)}</p>}
    <form className="panel stack" onSubmit={ask}>
      <label>문서<select value={id} onChange={(event) => { setId(event.target.value); setResult('') }} disabled={pending}>
        <option value="">문서 선택</option>
        {documents.data?.data.map((doc) => <option value={doc.id} key={doc.id}>{doc.filename} · {doc.status}</option>)}
      </select></label>
      <label>질문 (비워 두면 요약)<input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} /></label>
      <div className="actions">
        <button type="submit" disabled={pending || !ready}>응답 받기</button>
        {pending && <button type="button" className="secondary" onClick={() => running.current?.abort()}>중단</button>}
      </div>
    </form>
    {message && <p role="alert" className="error">{message}</p>}
    <pre className="answer" aria-live="polite">{result}</pre>
  </section>
}
