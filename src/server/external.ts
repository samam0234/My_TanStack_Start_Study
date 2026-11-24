import '@tanstack/react-start/server-only'
import Stripe from 'stripe'
import type { Knex } from 'knex'
import type { User } from '../board/contracts'
import { appOrigin } from './env'
import { ApiError } from './errors'
import { limitedBody } from './http'
import { isUniqueViolation } from './auth'

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Stripe를 설정하세요.')
  return new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 })
}

export async function checkout(user: User, operationId: string) {
  const price = process.env.STRIPE_PRICE_ID
  if (!price) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Stripe 가격을 설정하세요.')
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price, quantity: 1 }],
    client_reference_id: String(user.id),
    success_url: appOrigin() + '/account?checkout=returned',
    cancel_url: appOrigin() + '/account',
  }, { idempotencyKey: 'study-' + user.id + '-' + operationId })
  return { url: session.url }
}

export async function paymentWebhook(db: Knex, request: Request) {
  const signature = request.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Stripe webhook을 설정하세요.')
  const payload = await limitedBody(request, 256 * 1024)
  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(payload, signature ?? '', secret)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'BAD_REQUEST', '웹훅 서명 검증에 실패했습니다.')
  }
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return
  const session = event.data.object as Stripe.Checkout.Session
  if (session.payment_status !== 'paid' || !session.client_reference_id) return
  const userId = Number(session.client_reference_id)
  if (!Number.isInteger(userId) || userId < 1) return
  try {
    await db('payments').insert({ session_id: session.id, user_id: userId, status: 'paid' })
  } catch (error) {
    if (!isUniqueViolation(error) && (error as { code?: string }).code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw error
  }
}

export async function sendTestMail(user: User) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  const to = process.env.MAIL_TEST_RECIPIENT
  if (!apiKey || !from || !to) throw new ApiError(503, 'SERVICE_UNAVAILABLE', '메일 발신자와 실습 수신자를 설정하세요.')
  if (user.email !== to.toLowerCase()) throw new ApiError(403, 'FORBIDDEN', '등록된 실습 수신자로 로그인하세요.')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json',
      'Idempotency-Key': 'tanstack-study-' + user.id + '-' + new Date().toISOString().slice(0, 10),
    },
    body: JSON.stringify({ from, to: [to], subject: 'TanStack 게시판 연결 확인', text: '실습 메일이 도착했습니다.' }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new ApiError(502, 'UPSTREAM_ERROR', '메일 서비스가 요청을 수락하지 않았습니다.')
  return { accepted: true }
}
