import { setTimeout as sleep } from 'node:timers/promises'
import { database } from '../src/server/database'
import { processDocument } from '../src/server/documents'

const controller = new AbortController()
process.once('SIGTERM', () => controller.abort())
process.once('SIGINT', () => controller.abort())

let cleaned = 0
try {
  const db = await database()
  try {
    console.info(JSON.stringify({ event: 'document_worker_ready' }))
    while (!controller.signal.aborted) {
      let worked = false
      try {
        const now = Date.now()
        if (now - cleaned >= 60_000) {
          await db('sessions').where('expires_at', '<=', now).delete()
          cleaned = now
        }
        worked = await processDocument(db)
      } catch (error) {
        console.error({ event: 'document_job_failed', type: (error as Error).name })
      }
      if (!worked) await sleep(1000, undefined, { signal: controller.signal })
    }
  } finally { await db.destroy() }
} catch (error) {
  if (!controller.signal.aborted) throw error
}
