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
