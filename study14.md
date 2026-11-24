# study14 · API 설계·문서화

## 목표

공통 API v1을 유지하면서 Swagger UI에서 경로·인증·오류·페이지네이션을 확인한다.

## 📖 이론

REST 경로에는 복수 명사 자원을 놓고 HTTP 메서드가 읽기·등록·부분 수정·삭제를 표현한다. 목록은 `data`와 `meta`를 반환하고 모든 공통 오류에는 `code`, `message`, `requestId`가 있으며 검증일 때 `fields`가 더해진다. OpenAPI는 손님과 서버가 함께 읽는 주문서 양식이다.

## 🛠️ 실기

1. `/api-docs`에서 로컬 Swagger UI를 띄우고 `/openapi.json`을 연다.
2. `GET /api/posts`에 `q`, `page`, `limit`, `sort`를 입력한다. 변경 없는 호환 필드 추가는 v1을 유지하고, 깨지는 변경은 별도 `/api/v2` 전환 계획을 만든다. 이 실습 v1 URL은 Notion대로 `/api`를 사용한다.
3. `/api/auth/login`과 Bearer 인증을 사용해 201 + Location, PATCH 200, DELETE 204 그리고 권한 오류를 비교한다. 공통 v1의 검증 오류는 400이고 문서 기능 확장은 422를 별도로 문서화한다.
4. 실패 응답의 `X-Request-Id`와 `error.requestId`가 같은지 확인한다.

```powershell
curl.exe -i 'http://localhost:5173/api/posts?page=1&limit=10&sort=-commentCount'
curl.exe -i -H 'X-Request-Id: study14-01' http://localhost:5173/api/posts/abc
curl.exe -i http://localhost:5173/openapi.json
```

### [src/routes/api-docs.tsx](src/routes/api-docs.tsx)

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import bundle from 'swagger-ui-dist/swagger-ui-bundle.js?url'
import stylesheet from 'swagger-ui-dist/swagger-ui.css?url'

type SwaggerWindow = Window & {
  SwaggerUIBundle?: (options: { domNode: HTMLElement; url: string; validatorUrl: null }) => unknown
}

export const Route = createFileRoute('/api-docs')({
  head: () => ({ links: [{ rel: 'stylesheet', href: stylesheet }] }),
  component: ApiDocs,
})

function ApiDocs() {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const script = document.createElement('script')
    script.src = bundle
    script.onload = () => {
      if (container.current) (window as SwaggerWindow).SwaggerUIBundle?.({
        domNode: container.current, url: '/openapi.json', validatorUrl: null,
      })
    }
    document.body.appendChild(script)
    return () => script.remove()
  }, [])

  return <section>
    <h1>게시판 API 문서</h1>
    <a href="/openapi.json">OpenAPI JSON</a>
    <div ref={container} />
  </section>
}
```

| 줄 | 설명 |
| --- | --- |
| 1–5 | Swagger의 로컬 번들과 CSS URL을 가져온다. |
| 6–9 | 외부 번들이 넣는 전역 함수의 필요한 형태를 정의한다. |
| 10–14 | Swagger 전용 스타일을 이 경로에 연결한다. |
| 15–28 | 브라우저에서 로컬 Swagger 번들을 실행해 OpenAPI JSON을 읽는다. |
| 29–34 | JSON 링크와 Swagger가 렌더링할 위치를 배치한다. |

## 🔗 연동 포인트

[OpenAPI 전체 코드](public/openapi.json)에는 공통 v1 경로·성공·오류 스키마를 포함한다. `src/server/http.ts`가 모든 공통 응답 규칙을 적용하고, 요청 ID는 study16에서 구조화 로그와 연결한다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| Swagger UI가 비어 있음 | OpenAPI JSON이나 번들 자산 로딩 실패 | Network에서 `/openapi.json` 및 Swagger JS 응답을 확인한다. |
| 1페이지가 한 칸 밀림 | 사용자 페이지와 SQL offset이 혼용됨 | offset을 `(page - 1) * limit`으로 계산한다. |
| 오류 요청 ID가 다름 | 중도에 요청 ID를 다시 생성 | 서버 래퍼에서 요청 ID 하나를 헤더와 응답에 공용 사용한다. |

## 직접 해보기

1. Swagger Try it out으로 목록 필터를 실행한다.
2. 타인 수정과 잘못된 ID를 보내 403·400의 공통 바디를 비교한다.
3. v2로 옮겨야 하는 변경 예시를 한 가지 적는다.

## ☐ 체크리스트

- [ ] OpenAPI와 실제 API의 인증·경로·응답을 비교했다.
- [ ] 기본 페이지·최대 한도·정렬과 v1 호환 규칙을 설명할 수 있다.

## 다음 단계

요청을 측정하고 조회 캐시와 작업 큐를 조정한다. [study15](study15.md)

[공식 문서](https://spec.openapis.org/oas/v3.0.3)
