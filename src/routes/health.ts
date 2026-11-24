import { createFileRoute } from '@tanstack/react-router'
import { database } from '../server/database'
import { json, respond } from '../server/http'

export const Route = createFileRoute('/health')({
  server: { handlers: {
    GET: ({ request }) => respond(request, async () => {
      await (await database()).raw('select 1')
      return json({ status: 'ok' })
    }),
  } },
})
