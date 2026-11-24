# study11 · DB 확장

## 목표

SQLite 게시판 데이터를 PostgreSQL 또는 MariaDB로 옮기고 MongoDB CRUD의 문서 모델을 실습한다.

## 📖 이론

Knex는 SQL 쿼리 빌더이며 드라이버, URL, 연결 풀, 자동 증가 반환 처리만 DB별로 달라진다. ORM을 고를 때도 각 SQL 드라이버의 매핑과 마이그레이션이 필요하다. MongoDB는 컬렉션과 ObjectId를 사용한다. 같은 자료를 줄·칸 단위 대장과 독립된 문서 카드에 각각 기록하는 차이다.

## 🛠️ 실기

1. 환경 파일을 백업하고 앱 쓰기를 멈춘 다음 복제한 SQLite를 `SQLITE_FILE`에 지정한다. 빈 대상 PostgreSQL 또는 MariaDB URL을 `DATABASE_URL`로 넣는다.
2. `npm run db:copy`로 사용자·게시글·댓글을 이관한다. 세션·결제·문서는 이 기초 DB 이관 스크립트의 대상에서 제외되어 있어 이관 전 범위를 확인한다. 대상 앱에서 다시 로그인한다.
3. PostgreSQL은 `pg`와 `RETURNING id`, MariaDB는 `mysql2`와 INSERT 결과, SQLite는 파일·전용 연결을 쓴다. MariaDB 컨테이너의 노출 포트는 13309다. PostgreSQL은 기본 Compose 내부 `db:5432`이며, 호스트 이관용 로컬 PostgreSQL을 사용할 때만 loopback 포트로 연결한다.
4. MongoDB 실습은 ID와 스키마가 다른 독립 CRUD를 커맨드로 실행한다. 라이브 게시판은 SQL 어댑터를 사용한다.

```powershell
docker compose --profile db-labs up -d maria mongo
$env:DATABASE_URL = 'mysql://board:board-local-only@localhost:13309/board'
npm run db:copy
npm run dev
# 별도 PowerShell에서 MongoDB 문서 CRUD 실습
$env:MONGO_URL = 'mongodb://localhost:27019/tanstack_study'
npm run db:mongo -- create '첫 문서'
npm run db:mongo -- list
$docId = '목록에서 복사한 24자리 ObjectId'
npm run db:mongo -- get $docId
npm run db:mongo -- update $docId '수정된 문서'
npm run db:mongo -- delete $docId
```

### [src/server/database.ts](src/server/database.ts)

```ts
import '@tanstack/react-start/server-only'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import knex, { type Knex } from 'knex'

export function openDatabase(url = process.env.DATABASE_URL, file = process.env.SQLITE_FILE ?? './data/board.sqlite') {
  if (url) {
    const protocol = new URL(url).protocol
    if (protocol === 'postgres:' || protocol === 'postgresql:') {
      return knex({ client: 'pg', connection: url, pool: { min: 0, max: 5 } })
    }
    if (protocol === 'mysql:' || protocol === 'mariadb:') {
      return knex({ client: 'mysql2', connection: url.replace(/^mariadb:/, 'mysql:'), pool: { min: 0, max: 5 } })
    }
    throw new Error('DATABASE_URL must point to PostgreSQL or MariaDB')
  }
  mkdirSync(dirname(file), { recursive: true })
  return knex({
    client: 'better-sqlite3',
    connection: { filename: file },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      afterCreate(connection: { pragma: (sql: string) => unknown }, done: (error: Error | null, connection: unknown) => void) {
        connection.pragma('foreign_keys = ON')
        connection.pragma('busy_timeout = 5000')
        done(null, connection)
      },
    },
  })
}

export async function migrate(db: Knex) {
  await db.migrate.latest({
    migrationSource: {
      async getMigrations() { return ['001-board'] },
      getMigrationName(name: string) { return name },
      async getMigration() { return { up: createTables, down: dropTables } },
    },
  })
}

async function createTables(db: Knex) {
  await db.schema.createTable('users', (table) => {
    table.increments('id')
    table.string('email', 254).notNullable().unique()
    table.string('nickname', 50).notNullable()
    table.string('password_hash').nullable()
    table.string('github_id').nullable().unique()
  })
  await db.schema.createTable('sessions', (table) => {
    table.string('token_hash', 64).primary()
    table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    table.bigInteger('expires_at').notNullable().index()
  })
  await db.schema.createTable('posts', (table) => {
    table.increments('id')
    table.integer('user_id').unsigned().notNullable().references('users.id')
    table.string('title', 200).notNullable()
    table.text('body', 'mediumtext').notNullable()
    table.text('tags').notNullable()
    table.string('created_at', 24).notNullable().index()
    table.string('updated_at', 24).notNullable()
  })
  await db.schema.createTable('comments', (table) => {
    table.increments('id')
    table.integer('post_id').unsigned().notNullable().references('posts.id').onDelete('CASCADE').index()
    table.integer('user_id').unsigned().notNullable().references('users.id')
    table.text('body').notNullable()
    table.string('created_at', 24).notNullable()
  })
  await db.schema.createTable('documents', (table) => {
    table.string('id', 36).primary()
    table.integer('user_id').unsigned().notNullable().references('users.id').index()
    table.string('filename').notNullable()
    table.text('contents').nullable()
    table.string('status', 20).notNullable()
    table.bigInteger('lease_until').notNullable().defaultTo(0)
    table.string('lease_token', 36).nullable()
    table.index(['status', 'lease_until'])
  })
  await db.schema.createTable('payments', (table) => {
    table.string('session_id').primary()
    table.integer('user_id').unsigned().notNullable().references('users.id')
    table.string('status', 20).notNullable()
  })
}

async function dropTables(db: Knex) {
  for (const name of ['payments', 'documents', 'comments', 'posts', 'sessions', 'users']) {
    await db.schema.dropTable(name)
  }
}

let ready: Promise<Knex> | undefined

export function database() {
  ready ??= (async () => {
    const db = openDatabase()
    try {
      await migrate(db)
      return db
    } catch (error) {
      await db.destroy()
      ready = undefined
      throw error
    }
  })()
  return ready
}

export async function insertId(db: Knex, table: string, row: object) {
  if (db.client.config.client === 'pg') {
    const [inserted] = await db(table).insert(row).returning('id')
    return Number(inserted.id)
  }
  const [id] = await db(table).insert(row)
  return Number(id)
}
```

| 줄 | 설명 |
| --- | --- |
| 1–5 | 서버 전용 표시와 Knex 클라이언트를 가져온다. |
| 6–33 | DB URL 프로토콜로 PostgreSQL·MariaDB 드라이버를 고르고, URL이 없으면 SQLite 연결을 연다. |
| 34–43 | DB에 적용한 마이그레이션 버전을 관리한다. |
| 44–89 | 회원·세션·게시글·댓글·문서·결제의 FK와 인덱스를 만든다. |
| 90–95 | 의존하는 테이블부터 삭제하는 다운 마이그레이션이다. |
| 96–112 | 같은 프로세스에서 DB 초기화 Promise를 재사용하고 실패 시 재시도할 수 있게 한다. |
| 113–120 | PostgreSQL RETURNING과 다른 SQL 드라이버의 생성 ID 반환 형식을 맞춘다. |

### [scripts/copy-db.ts](scripts/copy-db.ts)

```ts
import { openDatabase, migrate } from '../src/server/database'

const targetUrl = process.env.DATABASE_URL
if (!targetUrl) throw new Error('Set DATABASE_URL to an empty PostgreSQL or MariaDB database')
const source = openDatabase('')
const target = openDatabase(targetUrl)
const tables = ['users', 'posts', 'comments'] as const

try {
  await migrate(source)
  await migrate(target)
  await target.transaction(async (trx) => {
    for (const table of tables) {
      if (await trx(table).first('id')) throw new Error('Target must be empty: ' + table)
      const rows = await source(table).orderBy('id')
      for (let offset = 0; offset < rows.length; offset += 50) {
        await trx(table).insert(rows.slice(offset, offset + 50))
      }
      if (target.client.config.client === 'pg') {
        await trx.raw("SELECT setval(pg_get_serial_sequence(?, 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ??",
          [table, table])
      }
      console.info(table + ': ' + rows.length)
    }
  })
} finally {
  await Promise.all([source.destroy(), target.destroy()])
}
```

| 줄 | 설명 |
| --- | --- |
| 1–2 | DB 연결과 스키마 실행 함수를 가져온다. |
| 3–8 | SQLite 원본과 SQL 대상, FK 의존 순서를 정한다. |
| 9–18 | 양쪽 스키마를 준비하고 대상이 빈 DB인지 검사한 후 배치로 복사한다. |
| 19–25 | PostgreSQL 시퀀스를 명시 ID 이관 뒤 최대값과 맞춘다. |
| 26–28 | 성공·실패 모두 연결을 정리한다. |

### [scripts/mongo-posts.mjs](scripts/mongo-posts.mjs)

```js
import { MongoClient, ObjectId } from 'mongodb'
import { z } from 'zod'

const request = z.enum(['create', 'list', 'get', 'update', 'delete']).parse(process.argv[2] ?? 'list')
const input = process.argv[3]
const updateTitle = process.argv[4]
const titleSchema = z.string().trim().min(1).max(200)
const url = process.env.MONGO_URL ?? 'mongodb://localhost:27017/tanstack_study'

const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 })
try {
  await client.connect()
  const posts = client.db().collection('study_posts')
  await posts.createIndex({ createdAt: -1, _id: -1 })

  switch (request) {
    case 'create': console.log(await posts.insertOne({ title: titleSchema.parse(input), createdAt: new Date() })); break
    case 'list': console.log(await posts.find().sort({ createdAt: -1, _id: -1 }).limit(10).toArray()); break
    case 'get': console.log(await posts.findOne({ _id: ObjectId.createFromHexString(input) })); break
    case 'update': console.log(await posts.updateOne({ _id: ObjectId.createFromHexString(input) },
      { $set: { title: titleSchema.parse(updateTitle), updatedAt: new Date() } })); break
    case 'delete': console.log(await posts.deleteOne({ _id: ObjectId.createFromHexString(input) })); break
  }
} finally { await client.close() }
```

| 줄 | 설명 |
| --- | --- |
| 1–3 | MongoDB 클라이언트, ObjectId와 입력 검사를 가져온다. |
| 4–9 | 명령과 제목, 연결 URL을 확인한다. |
| 10–15 | 연결 시간 제한을 두고 날짜·ID 인덱스를 만든다. |
| 16–23 | 등록, 목록, 문서 조회, 수정, 삭제를 컬렉션 연산에 매핑한다. |
| 24 | 연결을 닫고 명령을 끝낸다. |

## 🔗 연동 포인트

`src/server/database.ts`에 SQL 연결·풀·스키마와 `insertId`가 있다. API v1의 정수 ID는 SQL에서 유지한다. MongoDB를 게시판 저장소로 확장할 때 별도 저장소 어댑터와 안정된 정수 매핑, 인덱스 및 인증 데이터를 설계한다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `ECONNREFUSED` | DB 호스트명·포트 혼용 | Compose의 `db`는 컨테이너 내부 이름이며 호스트에서는 실제 공개 주소를 써야 한다. |
| 이관 후 중복 키 | 명시 ID 이관 뒤 시퀀스 미갱신 | 스크립트의 `setval`을 확인하고 다음 신규 글 ID를 확인한다. |
| ObjectId 파싱 오류 | 24자리 16진수가 아닌 값 | 목록 결과의 `_id`를 복사한다. |

## 직접 해보기

1. SQLite에서 작성한 글과 댓글을 새 MariaDB 또는 PostgreSQL DB로 복제한다.
2. 이관 후 새 글을 작성해 ID·개수가 이어지는지 확인한다.
3. MongoDB에서 문서 생성→상세→수정→삭제를 실행한다.

## ☐ 체크리스트

- [ ] SQL 연결과 드라이버별 차이를 확인했다.
- [ ] 이관 개수와 다음 자동 ID를 확인했다.
- [ ] MongoDB 컬렉션 CRUD를 실행했다.

## 다음 단계

DB의 데이터 흐름을 유지하며 화면의 UI·상태·폼 도구를 연결한다. [study12](study12.md)

[공식 문서](https://knexjs.org/guide/)
