import '@tanstack/react-start/server-only'
import { z } from 'zod'
import { requireUser } from './auth'
import { answer } from './ai'
import { database } from './database'
import { addDocument, documentText, listDocuments } from './documents'
import { notFound, valid } from './errors'
import { checkout, paymentWebhook, sendTestMail } from './external'
import { json, readJson } from './http'
import { beginOAuth, finishOAuth } from './oauth'
import { rateLimit } from './rate-limit'

const questions = z.object({ question: z.string().trim().max(500).default('') })

export async function extensions(request: Request, resource: string, id?: string, child?: string) {
  const method = request.method
  if (resource === 'oauth' && id === 'github' && method === 'GET') {
    if (!child) return beginOAuth()
    if (child === 'callback') return finishOAuth(request)
  }
  if (resource === 'payments' && id === 'webhook' && !child && method === 'POST') {
    await paymentWebhook(await database(), request)
    return new Response(null, { status: 204 })
  }
  if (resource === 'documents') {
    const db = await database()
    const user = await requireUser(db, request)
    if (!id && method === 'GET') return json({ data: await listDocuments(db, user.id) })
    if (!id && method === 'POST') {
      rateLimit('upload-' + user.id, 10)
      return json({ data: await addDocument(db, request, user.id) }, 202)
    }
    if (id && child === 'answer' && method === 'POST') {
      rateLimit('ai-' + user.id, 10)
      const { question } = valid(questions, await readJson(request), 422)
      return answer(await documentText(db, user.id, id), question, request.signal)
    }
  }
  if (resource === 'payments' && id === 'checkout' && !child && method === 'POST') {
    const user = await requireUser(await database(), request)
    rateLimit('payment-' + user.id, 10)
    const { operationId } = valid(z.object({ operationId: z.uuid() }), await readJson(request))
    return json({ data: await checkout(user, operationId) })
  }
  if (resource === 'payments' && !id && method === 'GET') {
    const db = await database()
    const user = await requireUser(db, request)
    const row = await db('payments').where({ user_id: user.id, status: 'paid' }).count({ total: '*' }).first()
    return json({ data: { paidCount: Number(row?.total ?? 0) } })
  }
  if (resource === 'mail' && id === 'test' && !child && method === 'POST') {
    const user = await requireUser(await database(), request)
    rateLimit('mail-' + user.id, 4)
    return json({ data: await sendTestMail(user) })
  }
  throw notFound()
}
