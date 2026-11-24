import '@tanstack/react-start/server-only'
import { ApiError } from './errors'

const windows = new Map<string, { expires: number; count: number }>()

export function rateLimit(key: string, max: number, duration = 60_000) {
  const now = Date.now()
  let entry = windows.get(key)
  if (!entry || entry.expires <= now) {
    if (windows.size >= 2000) {
      for (const [key, value] of windows) if (value.expires <= now) windows.delete(key)
    }
    if (windows.size >= 2000) throw new ApiError(429, 'RATE_LIMITED', '잠시 후 다시 시도하세요.')
    entry = { expires: now + duration, count: 0 }
    windows.set(key, entry)
  }
  entry.count++
  if (entry.count > max) throw new ApiError(429, 'RATE_LIMITED', '잠시 후 다시 시도하세요.')
}
