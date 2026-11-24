# study17 · 실시간과 파일 처리

## 목표

WebSocket 게시판 알림과 보호된 파일 처리의 상태 전이를 구현한다.

## 📖 이론

WebSocket은 연결을 유지해 서버에서도 메시지를 보낼 수 있다. 여기서는 공개 목록을 다시 읽을 신호만 보내며 브라우저는 REST와 loader에서 정상적으로 게시글을 조회한다. 계약서를 보내는 대신 새 문서가 도착했다는 벨만 울리는 방식이다.

## 🛠️ 실기

1. Nitro의 `features.websocket`을 켜고 `/ws/board`에서 Origin을 확인한다. 연결마다 별도 DB 타이머를 만들지 않고 한 타이머가 공개 개정 번호를 조회한다.
2. 게시판 두 탭을 열어 한쪽에서 글을 작성한다. 다른 탭에서 다음 신호(약 3초 주기) 뒤 목록이 갱신되는지 본다. 연결 종료 시 클라이언트가 지수형 간격으로 재연결한다.
3. `/documents`는 인증과 요청 크기 제한, 확장자 제한을 거쳐 파일을 UUID 키로 임시 보관한다. worker는 큐를 가져가 엄격한 UTF-8로 읽고 DB에 텍스트를 저장한다.
4. worker의 상태 `queued → working → ready/failed`를 관찰한다. 파일 임시 볼륨은 같은 앱·worker에 마운트한다.

### [server/routes/ws/board.ts](server/routes/ws/board.ts)

```ts
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
```

| 줄 | 설명 |
| --- | --- |
| 1–4 | Nitro의 WebSocket 핸들러와 DB 환경을 연결한다. |
| 5–8 | 연결과 하나의 공유 타이머를 유지한다. |
| 9–23 | 공개 글과 댓글의 집계를 비교할 수 있는 문자열로 보낸다. |
| 24–42 | 업그레이드 출처 제한, 열기/닫기와 타이머 수명을 관리한다. |

### [src/server/documents.ts](src/server/documents.ts)

```ts
import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Knex } from 'knex'
import { ApiError, notFound } from './errors'
import { limitedBody } from './http'

export const uploadLimit = 32 * 1024

function uploadPath(id: string) {
  return join(process.env.UPLOAD_DIR ?? './data/uploads', id + '.txt')
}

export async function addDocument(db: Knex, request: Request, userId: number) {
  const filename = new URL(request.url).searchParams.get('filename') ?? ''
  if (!/^[^/\\\u0000-\u001f]{1,120}\.(txt|md)$/i.test(filename)) {
    throw new ApiError(400, 'BAD_REQUEST', 'TXT 또는 Markdown 파일을 선택하세요.')
  }
  const bytes = await limitedBody(request, uploadLimit)
  const id = randomUUID()
  await mkdir(process.env.UPLOAD_DIR ?? './data/uploads', { recursive: true })
  await writeFile(uploadPath(id), bytes, { flag: 'wx', mode: 0o600 })
  try {
    await db('documents').insert({ id, user_id: userId, filename, status: 'queued' })
  } catch (error) {
    await rm(uploadPath(id), { force: true })
    throw error
  }
  return { id, filename, status: 'queued' }
}

export async function listDocuments(db: Knex, userId: number) {
  return db('documents').where({ user_id: userId }).select('id', 'filename', 'status').orderBy('filename').limit(100)
}

export async function documentText(db: Knex, userId: number, id: string): Promise<string> {
  const row = await db('documents').where({ id, user_id: userId }).first()
  if (!row) throw notFound()
  if (row.status !== 'ready') throw new ApiError(409, 'DOCUMENT_NOT_READY', '문서 처리가 완료되지 않았습니다.')
  return row.contents
}

export async function processDocument(db: Knex) {
  const now = Date.now()
  const available = db('documents').where((query) => query.where({ status: 'queued' })
    .orWhere((expired) => expired.where({ status: 'working' }).where('lease_until', '<', now)))
  const job = await available.clone().select('id').orderBy('id').first()
  if (!job) return false
  const token = randomUUID()
  const claimed = await available.where({ id: job.id }).update({
    status: 'working', lease_until: now + 60_000, lease_token: token,
  })
  if (!claimed) return true

  let contents: string | null = null
  try {
    const bytes = await readFile(uploadPath(job.id))
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim()
    if (decoded && !decoded.includes('\0')) contents = decoded
  } catch (error) {
    console.warn(JSON.stringify({ event: 'document_read_failed', id: job.id, type: (error as Error).name }))
  }
  const saved = await db('documents').where({ id: job.id, lease_token: token }).update({
    contents, status: contents ? 'ready' : 'failed', lease_until: 0, lease_token: null,
  })
  if (saved) await rm(uploadPath(job.id), { force: true }).catch(() => {
    console.warn(JSON.stringify({ event: 'document_cleanup_failed', id: job.id }))
  })
  return true
}
```

| 줄 | 설명 |
| --- | --- |
| 1–8 | 암호화 ID, 내부 파일 접근과 요청 크기 평가를 가져온다. |
| 9–14 | 파일 제한량과 서버 내부의 UUID 경로를 설정한다. |
| 15–32 | 입력 이름·크기를 검증하고 파일 및 큐 정보를 저장한다. |
| 33–43 | 소유자 범위에서 목록과 텍스트 읽기를 제공한다. |
| 44–71 | lease를 선점하고, 텍스트 유효성을 확인한 뒤 같은 토큰으로 상태를 갱신한다. |

## 🔗 연동 포인트

`src/board/live.tsx`가 `/ws/board` 신호를 Query 갱신으로 연결한다. `src/routes/documents.tsx`에서 worker가 ready로 바꾼 문서를 고른다. 여러 서버에서 사용자별 사설 알림이 필요하면 인증과 메시지 브로커, 재접속 시 누락 보정이 필요하다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| WebSocket 연결 403 | 현재 페이지 주소와 허용 Origin이 다름 | APP_ORIGIN을 스킴과 포트까지 맞춘다. |
| 업데이트가 안 보임 | 프록시 업그레이드 문제 또는 잘못된 캐시 키 | Network WS 프레임과 `['posts']` 무효화를 확인한다. |
| 파일 응답 413 | 32 KiB 초과 | 샘플 텍스트 파일로 다시 시험한다. |
| 파일 failed | 잘못된 인코딩·빈 문서·파일 볼륨 불일치 | UTF-8로 저장하고 worker가 같은 볼륨을 쓰는지 확인한다. |

## 직접 해보기

1. 두 탭을 열고 한쪽 글을 수정해 다른 탭에 반영되는지 확인한다.
2. 샘플 파일과 32 KiB 초과 파일의 응답을 확인한다.
3. 오프라인 전환 후 재연결과 캐시 무효화를 관찰한다.

## ☐ 체크리스트

- [ ] WebSocket Origin과 공개 변경 신호를 확인했다.
- [ ] 임시 파일과 소유자 검증, worker 상태 전이를 확인했다.

## 다음 단계

처리된 문서의 발췌를 모델 API와 MCP 도구에 연결한다. [study18](study18.md)

[공식 문서](https://nitro.build/docs/websocket)
