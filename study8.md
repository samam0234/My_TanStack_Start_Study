# study8 · 구조화·재사용

## 목표

TanStack Start의 화면, 공유 계약, 서버 코드와 개발·운영 설정을 분리한다.

## 📖 이론

화면과 데이터 규칙을 각각 테스트할 수 있게 경계를 나눈다. `src/board`의 공용 Zod 계약은 양쪽에서 쓸 수 있고 `src/server`의 비밀값과 DB는 서버에만 남는다. 공장 작업장의 구역처럼 입구는 라우트, 규격표는 계약, 자재실은 서버 저장소다.

## 🛠️ 실기

1. `src/routes/`는 URL에 연결하고, `src/board/contracts.ts`에 입력과 직렬화 타입을 둔다. `src/server/http.ts`에서 공통 헤더와 오류 응답을 처리한다.
2. `src/server/env.ts`가 Origin·Secure 여부를 정한다. 서버 전용 모듈은 `@tanstack/react-start/server-only`를 사용한다.
3. 개발은 `.env`와 Vite 개발 서버, 운영은 컨테이너 환경 주입과 명시적 `APP_ORIGIN`을 사용한다. 서버 키에 `VITE_` 접두사는 붙이지 않는다.

### [src/server/env.ts](src/server/env.ts)

```ts
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
```

| 줄 | 설명 |
| --- | --- |
| 1–2 | 이 모듈을 클라이언트 import 경로에서 보호한다. |
| 3–6 | 서버에서 사용자에게 공개되는 기본 Origin을 읽는다. |
| 7–11 | 별도 허용 Origin이 없으면 앱 Origin으로 돌아간다. |
| 12–14 | 앱 주소의 HTTPS 여부를 쿠키 설정과 연결한다. |

### [src/server/errors.ts](src/server/errors.ts)

```ts
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
```

| 줄 | 설명 |
| --- | --- |
| 1–2 | 공용 검증 타입을 가져온다. |
| 3–11 | 상태, 코드, 메시지와 선택적 필드를 하나로 모은다. |
| 12–15 | 없는 자원의 공통 응답을 생성한다. |
| 16–26 | 검증 실패를 필드별 배열로 묶어 API에 전달한다. |
| 27–33 | 정수 형식과 DB의 허용 범위를 검증한다. |

## 🔗 연동 포인트

화면 요청 코드는 `src/board/client.ts`를 공통 사용한다. Docker가 운영 환경을 주입하고 테스트는 별도 DB 파일·테스트 Origin을 사용한다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 운영 쿠키가 전송되지 않음 | `APP_ORIGIN`이 실제 HTTPS 주소와 다름 | 공개 주소를 컨테이너에 주입하고 재시작한다. |
| 서버 비밀이 번들에 노출될 위험 | 공유 UI 코드에서 환경값을 공개 설정으로 선언 | 서버 전용 모듈에 두고 클라이언트 산출물을 점검한다. |

## 직접 해보기

1. `.env.example`과 Compose 환경의 공통 값을 대조한다.
2. 오타가 난 ID 요청에서 공통 오류 모양을 확인한다.
3. DB 호출을 제거하지 않고 동일한 요청 래퍼로 `health`와 API를 묶는 과정을 설명한다.

## ☐ 체크리스트

- [ ] 화면·계약·API·DB의 위치를 찾을 수 있다.
- [ ] 개발과 운영에서 Origin 및 비밀값을 분리했다.

## 다음 단계

분리된 스키마·DB·HTTP 경계를 자동화 테스트로 검증한다. [study9](study9.md)

[공식 문서](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection)
