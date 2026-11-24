import { createFileRoute, Link, redirect, useRouter, type SearchSchemaInput } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { api, errorMessage, jsonRequest } from '../board/client'

export const Route = createFileRoute('/account')({
  validateSearch: (search: { checkout?: 'returned' } & SearchSchemaInput) => ({
    checkout: search.checkout === 'returned' ? 'returned' as const : undefined,
  }),
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/login' })
    return { user: context.user }
  },
  component: Account,
})

function Account() {
  const { user } = Route.useRouteContext()
  const { checkout } = Route.useSearch()
  const router = useRouter()
  const payments = useQuery({
    queryKey: ['payments', user.id],
    queryFn: () => api<{ data: { paidCount: number } }>('/payments'),
    refetchInterval: checkout ? 4000 : false,
  })
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const operationId = useRef('')
  const running = useRef(false)

  async function run(action: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setPending(true)
    setMessage('')
    try { await action() } catch (error) { setMessage(errorMessage(error)) }
    finally { running.current = false; setPending(false) }
  }

  return <section className="stack">
    <h1>내 계정</h1>
    <p>{user.nickname} · {user.email}</p>
    <div className="actions">
      <Link to="/documents">문서 실습</Link>
      <button className="secondary" disabled={pending} onClick={() => void run(async () => {
        await api('/auth/logout', { method: 'POST' })
        await router.invalidate()
        await router.navigate({ to: '/login' })
      })}>로그아웃</button>
    </div>
    <section className="panel stack">
      <h2>외부 서비스 실습</h2>
      {checkout && <p role="status">결제 화면에서 돌아왔습니다. 결제 상태는 서버 웹훅에서 검증합니다.</p>}
      {payments.data && <p>확인된 결제 {payments.data.data.paidCount}건</p>}
      <div className="actions">
        <button disabled={pending} onClick={() => void run(async () => {
          operationId.current ||= crypto.randomUUID()
          const { data } = await api<{ data: { url: string | null } }>('/payments/checkout',
            jsonRequest('POST', { operationId: operationId.current }))
          if (!data.url) throw new Error('결제 URL을 받지 못했습니다.')
          window.location.assign(data.url)
        })}>Stripe 결제 화면</button>
        <button className="secondary" disabled={pending} onClick={() => void run(async () => {
          await api('/mail/test', { method: 'POST' })
          setMessage('메일 발송 요청이 접수되었습니다.')
        })}>실습 메일 보내기</button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  </section>
}
