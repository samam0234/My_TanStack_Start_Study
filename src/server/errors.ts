import { z } from 'zod'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) { super(message) }
}

export function notFound() {
  return new ApiError(404, 'NOT_FOUND', '요청한 대상을 찾을 수 없습니다.')
}

export function valid<T>(schema: z.ZodType<T>, data: unknown, status = 400): T {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  const fields: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '_form')
    ;(fields[key] ??= []).push(issue.message)
  }
  throw new ApiError(status, 'VALIDATION_ERROR', '입력값을 확인하세요.', fields)
}

export function positiveId(value: string) {
  const id = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) {
    throw new ApiError(400, 'BAD_REQUEST', 'id는 범위 내의 양의 정수여야 합니다.')
  }
  return id
}
