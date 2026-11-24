import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { appOrigin, corsOrigin } from './env'
import { ApiError } from './errors'

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  const result = new Headers(headers)
  result.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { status, headers: result })
}

export async function limitedBody(request: Request, limit: number) {
  const reader = request.body?.getReader()
  const chunks: Uint8Array<ArrayBufferLike>[] = []
  let size = 0
  try {
    while (reader) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '요청 크기 제한을 초과했습니다.')
      }
      chunks.push(value)
    }
  } finally {
    reader?.releaseLock()
  }
  return Buffer.concat(chunks, size)
}

export async function readJson(request: Request) {
  const bytes = await limitedBody(request, 256 * 1024)
  try { return JSON.parse(bytes.toString('utf8')) as unknown }
  catch { throw new ApiError(400, 'BAD_REQUEST', 'JSON 본문을 확인하세요.') }
}

function corsHeaders(headers: Headers, origin: string | null) {
  headers.append('Vary', 'Origin')
  if (origin && [appOrigin(), corsOrigin()].includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id')
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    headers.set('Access-Control-Expose-Headers', 'X-Request-Id, Location')
  }
}

export async function respond(request: Request, action: () => Response | Promise<Response>) {
  const suppliedId = request.headers.get('x-request-id')
  const requestId = suppliedId && /^[a-zA-Z0-9._-]{1,128}$/.test(suppliedId) ? suppliedId : randomUUID()
  const origin = request.headers.get('origin')
  const start = performance.now()
  let response: Response
  try {
    const writes = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    if (writes && ((origin && ![appOrigin(), corsOrigin()].includes(origin))
      || (!origin && request.headers.get('sec-fetch-site') === 'cross-site'))) {
      throw new ApiError(403, 'FORBIDDEN', '허용된 출처에서 요청하세요.')
    }
    response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await action()
  } catch (error) {
    const expected = error instanceof ApiError
    if (!expected) console.error({ requestId, error })
    response = json({ error: {
      code: expected ? error.code : 'INTERNAL',
      message: expected ? error.message : '서버 오류가 발생했습니다.',
      fields: expected ? error.fields : undefined,
      requestId,
    } }, expected ? error.status : 500)
  }
  response.headers.set('X-Request-Id', requestId)
  if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Server-Timing', 'app;dur=' + (performance.now() - start).toFixed(1))
  corsHeaders(response.headers, origin)
  if (process.env.LOG_REQUESTS === '1') {
    console.info(JSON.stringify({ requestId, method: request.method, path: new URL(request.url).pathname,
      status: response.status, durationMs: Math.round(performance.now() - start) }))
  }
  return response
}
