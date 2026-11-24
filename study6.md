# study6 · DB·API 연동

## 목표

SQLite에 게시글과 댓글을 저장하고 Notion의 공통 API v1을 구현한다.

## 📖 이론

Knex는 요청 값과 SQL을 분리하고, 마이그레이션은 DB 구조를 버전으로 관리한다. 관계 키는 수정·삭제 권한과 댓글 연결의 근거가 된다. 도서 대출 기록처럼 글과 작성자, 댓글의 키를 통해 관련 항목을 찾을 수 있다.

## 🛠️ 실기

1. `.env`에서 `DATABASE_URL`을 비우고 `SQLITE_FILE`을 설정한다. 첫 `/health` 요청에서 마이그레이션과 DB 읽기를 확인한다.
2. `users`, `sessions`, `posts`, `comments`의 PK·FK와 자료형을 확인한다. 등록은 201과 `Location`, 목록은 `data/meta`, 상세·수정은 `data`, 삭제는 빈 204를 사용한다.
3. 작성자로 로그인해 글 등록·검색·상세·부분 수정·삭제를 해 보고, 댓글 등록·목록·삭제도 확인한다.
4. DB 연결과 소유권 오류는 `error.code/message/fields/requestId` 응답으로 전달한다. 공통 API 스펙 v1에 따라 게시글 입력 검증 실패는 400이다.

```powershell
curl.exe -i http://localhost:5173/health
curl.exe -i 'http://localhost:5173/api/posts?page=1&limit=10&sort=-createdAt'
npm run test:e2e
```

### [src/server/posts.ts](src/server/posts.ts)

```ts
import '@tanstack/react-start/server-only'
import type { Knex } from 'knex'
import { type Post, type PostList, type Search, postInput, postPatch, commentInput } from '../board/contracts'
import { insertId } from './database'
import { ApiError, notFound, valid } from './errors'

type PostRow = {
  id: number; user_id: number; title: string; body: string; tags: string
  created_at: string; updated_at: string; nickname: string; comment_count: number | string
}

function postsWithAuthors(db: Knex) {
  const counts = db('comments').groupBy('post_id').select('post_id').count({ count: '*' }).as('counts')
  return db('posts').join('users', 'users.id', 'posts.user_id')
    .leftJoin(counts, 'counts.post_id', 'posts.id')
    .select('posts.*', 'users.nickname', db.raw('coalesce(counts.count, 0) as comment_count'))
}

function summary(row: PostRow) {
  return {
    id: row.id, title: row.title, author: { id: row.user_id, nickname: row.nickname },
    commentCount: Number(row.comment_count), createdAt: row.created_at,
  }
}

export async function listPosts(db: Knex, search: Search): Promise<PostList> {
  const { q, page, limit, sort } = search
  const posts = postsWithAuthors(db)
  const count = db('posts')
  if (q) {
    const dialect = db.client.config.client
    const contains = dialect === 'pg' ? 'strpos(lower(??), lower(?)) > 0' : 'instr(lower(??), lower(?)) > 0'
    for (const query of [posts, count]) {
      query.where((builder) => builder.whereRaw(contains, ['posts.title', q]).orWhereRaw(contains, ['posts.body', q]))
    }
  }

  if (sort === '-commentCount') posts.orderBy('comment_count', 'desc')
  const direction = sort === 'createdAt' ? 'asc' : 'desc'
  posts.orderBy('posts.created_at', direction).orderBy('posts.id', direction)
  const [rows, totals] = await Promise.all([posts.limit(limit).offset((page - 1) * limit), count.count({ total: '*' })])
  const total = Number(totals[0].total)
  return { data: rows.map(summary), meta: { page, limit, total, totalPages: Math.ceil(total / limit), q } }
}

export async function getPost(db: Knex, id: number): Promise<Post> {
  const row: PostRow | undefined = await postsWithAuthors(db).where('posts.id', id).first()
  if (!row) throw notFound()
  return { ...summary(row), body: row.body, tags: JSON.parse(row.tags), updatedAt: row.updated_at }
}

export async function createPost(db: Knex, userId: number, input: unknown) {
  const { title, body, tags } = valid(postInput, input)
  const now = new Date().toISOString()
  const id = await insertId(db, 'posts', {
    user_id: userId, title, body, tags: JSON.stringify(tags), created_at: now, updated_at: now,
  })
  return getPost(db, id)
}

async function checkOwner(db: Knex, table: 'posts' | 'comments', id: number, userId: number) {
  const row = await db(table).where({ id }).select('user_id').first()
  if (!row) throw notFound()
  if (row.user_id !== userId) throw new ApiError(403, 'FORBIDDEN', '작성자만 변경할 수 있습니다.')
}

export async function updatePost(db: Knex, userId: number, id: number, input: unknown) {
  const { tags, ...changes } = valid(postPatch, input)
  return db.transaction(async (trx) => {
    await checkOwner(trx, 'posts', id, userId)
    const changed = await trx('posts').where({ id, user_id: userId }).update({
      ...changes, ...(tags === undefined ? {} : { tags: JSON.stringify(tags) }), updated_at: new Date().toISOString(),
    })
    if (!changed) throw notFound()
    return getPost(trx, id)
  })
}

export async function deleteOwned(db: Knex, table: 'posts' | 'comments', userId: number, id: number) {
  await checkOwner(db, table, id, userId)
  if (!await db(table).where({ id, user_id: userId }).delete()) throw notFound()
}

export async function listComments(db: Knex, postId: number) {
  await getPost(db, postId)
  return commentRows(db).where('comments.post_id', postId).orderBy('comments.id').then((rows) => rows.map(mapComment))
}

function commentRows(db: Knex) {
  return db('comments').join('users', 'users.id', 'comments.user_id').select('comments.*', 'users.nickname')
}

function mapComment(row: { id: number; body: string; user_id: number; nickname: string; created_at: string }) {
  return { id: row.id, body: row.body, author: { id: row.user_id, nickname: row.nickname }, createdAt: row.created_at }
}

export async function createComment(db: Knex, userId: number, postId: number, input: unknown) {
  const { body } = valid(commentInput, input)
  return db.transaction(async (trx) => {
    await getPost(trx, postId)
    const id = await insertId(trx, 'comments', {
      user_id: userId, post_id: postId, body, created_at: new Date().toISOString(),
    })
    return mapComment(await commentRows(trx).where('comments.id', id).first())
  })
}
```

| 줄 | 설명 |
| --- | --- |
| 1–6 | 공용 계약, insertId와 오류 타입을 가져온다. |
| 7–18 | SQL 조인 결과 타입과 댓글 집계 기반 목록 쿼리를 작성한다. |
| 19–25 | 목록 전용 JSON 필드를 camelCase로 만든다. |
| 26–45 | 바인딩된 검색값, 정렬, offset/limit 및 총 건수를 적용한다. |
| 46–51 | 한 건의 본문, 태그와 수정 시각을 포함한다. |
| 52–60 | 스키마로 검증하고 ISO UTC 시각을 넣어 등록한다. |
| 61–66 | 수정·삭제 전에 DB의 작성자와 요청자를 비교한다. |
| 67–78 | 보낸 필드만 바꾸고 같은 트랜잭션에서 새 상세를 조회한다. |
| 79–83 | 작성자 범위를 포함한 조건으로 삭제한다. |
| 84–96 | 글 존재 여부를 확인하고 번호 순으로 댓글을 읽는다. |
| 97–106 | 트랜잭션 안에서 글·댓글의 연결을 유지한다. |

## 🔗 연동 포인트

`src/server/database.ts`가 연결과 마이그레이션을, `src/server/board-api.ts`가 HTTP 계약을 담당한다. 화면 loader와 API가 `posts.ts`를 공유한다. study11에서 같은 계약을 유지하면서 PostgreSQL과 MariaDB로 바꾼다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `SQLITE_BUSY` | 다른 프로세스가 쓰기 잠금을 보유 | 중복 서버를 줄이고 SQLite busy_timeout과 짧은 트랜잭션을 확인한다. |
| PATCH 이후 태그가 없어짐 | 수정 스키마가 누락 필드에 기본값 적용 | `postPatch`에서 기본값이 없는 필드 스키마를 사용한다. |
| 목록에 meta 없음 | API가 배열만 잘라서 반환 | 서비스의 `PostList` 전체를 반환한다. |

## 직접 해보기

1. `q`로 본문을 찾고 `limit=100`이 50으로 조정되는지 확인한다.
2. PATCH에 제목만 넣어 태그가 유지되는지 확인한다.
3. 댓글이 있는 글 삭제 후 연결된 댓글도 제거되는지 확인한다.

## ☐ 체크리스트

- [ ] 목록 응답 `data`와 `meta`를 그대로 받기
- [ ] 오류 응답 `error.code/message/fields`를 폼 오류로 표시
- [ ] 댓글까지 공통 API v1 경로를 확인했다.

## 다음 단계

기존 CRUD에 이어 회원 정보와 서버의 작성자 검사를 다룬다. [study7](study7.md)

[Notion 공통 API 스펙 v1](https://app.notion.com/p/3d6d7dec5e2e8139adbfd36dd506c65e)
