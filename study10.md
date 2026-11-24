# study10 · 배포와 기초 정리

## 목표

Vite·Nitro 빌드를 Node에서 구동하고 환경변수·DB·HTTPS를 점검한다.

## 📖 이론

빌드는 브라우저 자산과 Node 서버 엔트리를 만든다. 도메인은 사용자 주소, DNS는 주소를 서버로 연결하는 기록, HTTPS는 인증된 서버와의 암호화 통신이다. 정식 개점 때 설치 패키지와 열쇠를 따로 전달하듯, 이미지와 서버 환경값을 분리한다.

## 🛠️ 실기

1. `npm ci`, `npm run build`, `npm run typecheck`, `npm test`를 실행한다.
2. 로컬 프로덕션 실행은 `npm start`다. 3000 포트에서 사용할 때 `.env`의 `APP_ORIGIN`·`CORS_ORIGIN`도 3000으로 맞춘다. Linux 운영용 빌드는 대상 OS에서 만들거나 Docker를 사용한다.
3. 배포 Host에 DNS를 설정하고 Caddy의 예시 도메인을 실제 도메인으로 교체한다. Node 웹 서버는 내부 포트에서 실행한다.
4. 운영 DB 연결값과 백업 위치를 주입한다. 시작 후 `/health`, `/posts`, `/api/posts`, 로그인, 작성, 새로고침, 로그아웃, 404 순서로 점검한다.

```powershell
npm ci
npm run build
npm run typecheck
npm test
$env:APP_ORIGIN = 'http://localhost:3000'
$env:CORS_ORIGIN = 'http://localhost:3000'
npm start
# 다른 PowerShell에서
curl.exe -i http://localhost:3000/health
```

### [Caddyfile](Caddyfile)

```text
board.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
```

| 줄 | 설명 |
| --- | --- |
| 1 | 실제 도메인을 사이트 주소에 지정한다. |
| 2 | 텍스트 응답 압축을 활성화한다. |
| 3–4 | 외부 HTTPS를 로컬 Node 포트에 연결한다. |

### [src/routes/health.ts](src/routes/health.ts)

```ts
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
```

| 줄 | 설명 |
| --- | --- |
| 1–4 | 파일 라우트와 DB 검사를 가져온다. |
| 5–12 | HTTP GET에서 마이그레이션 준비와 `select 1` 성공 여부를 확인한다. |

## 🔗 연동 포인트

기초 구간을 이어 붙이면 루트 SSR → 검색 검증 → loader/API → DB → 쿠키 인증·권한 → 테스트 → 운영 빌드 순서가 된다. midpoint에서 이 범위로 게시판을 재현한다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 운영 500 | DB URL 또는 네이티브 라이브러리의 OS 불일치 | Health와 서버 로그를 확인하고 배포 대상 OS에서 재빌드한다. |
| 도메인 인증서 실패 | DNS나 프록시의 80/443 연결 문제 | 도메인·방화벽·Caddy 로그를 확인한다. |
| 로그인 쿠키 불일치 | 프록시 도메인과 APP_ORIGIN 설정 불일치 | HTTPS 공개 주소로 맞추고 Secure 쿠키를 확인한다. |

## 직접 해보기

1. 빌드한 서버에서 DevTools의 Document 응답을 확인한다.
2. `/health`와 `/api/posts`의 상태와 헤더를 기록한다.
3. 배포 점검 순서에 따라 익명·로그인 상태를 직접 확인한다.

## ☐ 체크리스트

- [ ] 빌드와 운영 모드에서 `/health`가 200으로 응답한다.
- [ ] 환경변수·DB·DNS·HTTPS·404·로그아웃을 점검했다.

## 다음 단계

기초 단계의 코드와 검증 순서를 작은 게시판 프로젝트로 묶는다. [midpoint](midpoint.md)

[공식 문서](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
