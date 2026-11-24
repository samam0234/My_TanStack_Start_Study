import { defineWebSocketHandler } from 'nitro'
import { database } from '../../../src/server/database'
import { appOrigin } from '../../../src/server/env'

const peers = new Map<string, (revision: string) => void>()
let timer: ReturnType<typeof setInterval> | undefined
let updating = false

async function publish() {
  if (updating) return
  updating = true
  try {
    const db = await database()
    const [posts, comments] = await Promise.all([
      db('posts').count({ count: '*' }).max({ latest: 'updated_at', id: 'id' }).first(),
      db('comments').count({ count: '*' }).max({ id: 'id' }).first(),
    ])
    const revision = JSON.stringify([posts?.count, posts?.latest, posts?.id, comments?.count, comments?.id])
    for (const send of peers.values()) send(revision)
  } catch (error) { console.warn({ event: 'ws_revision_failed', type: (error as Error).name }) }
  finally { updating = false }
}

export default defineWebSocketHandler({
  upgrade(request) {
    const origin = request.headers.get('origin')
    if (origin !== appOrigin()) return new Response(null, { status: 403 })
  },
  open(peer) {
    if (peers.size >= 100) { peer.close(1013, 'Try again later'); return }
    peers.set(peer.id, (data) => peer.send(data))
    timer ??= setInterval(() => void publish(), 3000)
    void publish()
  },
  close(peer) {
    peers.delete(peer.id)
    if (peers.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  },
})
