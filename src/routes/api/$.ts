import { createFileRoute } from '@tanstack/react-router'
import { boardApi } from '../../server/board-api'

export const Route = createFileRoute('/api/$')({
  server: { handlers: ({ createHandlers }) => createHandlers({
    GET: ({ request, params }) => boardApi(request, params._splat ?? ''),
    POST: ({ request, params }) => boardApi(request, params._splat ?? ''),
    PATCH: ({ request, params }) => boardApi(request, params._splat ?? ''),
    DELETE: ({ request, params }) => boardApi(request, params._splat ?? ''),
    OPTIONS: ({ request, params }) => boardApi(request, params._splat ?? ''),
  }) },
})
