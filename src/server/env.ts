import '@tanstack/react-start/server-only'

export function appOrigin() {
  return new URL(process.env.APP_ORIGIN ?? 'http://localhost:5173').origin
}

export function corsOrigin() {
  const value = process.env.CORS_ORIGIN
  return value ? new URL(value).origin : appOrigin()
}

export function secureCookies() {
  return appOrigin().startsWith('https://')
}
