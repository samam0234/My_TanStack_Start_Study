# study16 · 운영·CI/CD

## 목표

Docker Compose와 GitHub Actions를 사용해 빌드·검증·배포와 DB 복구 순서를 만든다.

## 📖 이론

멀티 스테이지 Dockerfile은 Linux에서 네이티브 SQLite 모듈을 빌드하고 운영 이미지에서 앱과 worker를 실행한다. CI는 변경을 검증하고 CD는 SHA 태그를 가진 이미지를 테스트 뒤 배포한다. 택배를 출고하기 전에 포장 검사를 마치고 해당 송장 번호로 언제든 물건을 다시 찾는 과정과 같다.

## 🛠️ 실기

1. `docker compose up -d --build --wait` 후 web·worker·db 상태와 `/health`를 확인한다.
2. 개발 URL과 운영 HTTPS URL을 구분한다. 운영 `.env`에 강한 DB 비밀번호와 그에 맞는 URL 인코딩된 `COMPOSE_DATABASE_URL`, 공개 `APP_ORIGIN` 및 외부 서비스 설정을 주입한다.
3. CI는 빌드, 타입, 단위/통합, 브라우저, Compose와 MCP를 실행한다. main push의 성공한 검증 뒤 이미지가 GHCR에 발행된다. 자체 서버에 `/srv/tanstack-start-study`용 Compose와 환경 파일, 레지스트리 pull 자격 증명, `tanstack-study` 라벨 러너를 준비하고 `DEPLOY_ENABLED=true`로 배포를 연결한다.
4. `/health`와 구조화된 로그를 모니터링한다. OS 셸에서 `pg_dump`로 만든 SQL을 호스트에 복사하고 별도의 복구용 빈 DB로 데이터를 읽어 본다.

```powershell
docker compose up -d --build --wait
docker compose ps
docker compose logs --tail 50 web worker
curl.exe -i http://localhost:3000/health
docker compose exec -T db pg_dump -U board -d board -f /tmp/board.sql
docker compose cp db:/tmp/board.sql ./board-backup.sql
# 복구 연습에만 사용할 별도의 새 DB
docker compose exec -T db createdb -U board board_restore_lab
docker compose cp ./board-backup.sql db:/tmp/board-restore.sql
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U board -d board_restore_lab -f /tmp/board-restore.sql
```

### [Dockerfile](Dockerfile)

```dockerfile
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src/server ./src/server
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

| 줄 | 설명 |
| --- | --- |
| 1–3 | 같은 Linux/Node 버전에서 의존성과 빌드 도구를 준비한다. |
| 4–8 | 잠금 파일 기반 설치를 캐시하고 앱을 빌드한 뒤 운영 의존성만 남긴다. |
| 9–16 | 빌드 출력과 worker 소스·의존성을 운영 이미지로 복사한다. |
| 17–19 | 영속 데이터 디렉터리를 만들고 실행 계정을 낮춘다. |
| 20 | Nitro 서버 엔트리를 운영 기본 명령으로 사용한다. |

### [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

```yaml
name: Publish and deploy
on:
  workflow_run:
    workflows: [Study checks]
    types: [completed]
    branches: [main]
  workflow_dispatch:

concurrency:
  group: production
  cancel-in-progress: false

jobs:
  publish:
    if: github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image: ${{ steps.image.outputs.name }}
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.event.workflow_run.head_sha || github.sha }}
      - id: image
        run: echo "name=ghcr.io/${GITHUB_REPOSITORY,,}:$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.image.outputs.name }}

  deploy:
    if: vars.DEPLOY_ENABLED == 'true'
    needs: publish
    environment: production
    runs-on: [self-hosted, linux, tanstack-study]
    permissions: {}
    steps:
      - name: Deploy tested image
        env:
          BOARD_IMAGE: ${{ needs.publish.outputs.image }}
        run: |
          set -eu
          cd /srv/tanstack-start-study
          docker compose pull web worker
          docker compose up -d --no-build --wait
```

| 줄 | 설명 |
| --- | --- |
| 1–13 | 검증 완료 또는 수동 실행을 정의하고 동시 배포를 직렬화한다. |
| 14–38 | 허용된 검증 결과로 SHA를 정하고 이미지를 GHCR에 푸시한다. |
| 39–53 | 배포가 활성화된 자체 러너에서 같은 SHA의 두 컨테이너를 교체한다. |

## 🔗 연동 포인트

배포 대상은 Caddy의 공개 HTTPS와 로컬 Compose 포트를 연결한다. 로그의 X-Request-Id, 5xx 비율, p95 처리 시간, worker 처리 지연을 관찰하고 복구는 이전 이미지 SHA와 백업을 사용한다.

## 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| worker 반복 재시작 | 실행 도구나 파일 경로 누락 | 이미지의 tsx 런타임과 공유 볼륨, worker 로그를 확인한다. |
| 로그가 모이지 않음 | 요청 로그 비활성 또는 수집기 미연결 | `LOG_REQUESTS=1`과 컨테이너 로그 수집을 확인한다. |
| 복원에서 SQL 오류 | 운영 DB에 직접 복원하거나 권한 누락 | 빈 복구 DB에서 `ON_ERROR_STOP`을 사용한다. |

## 직접 해보기

1. Health와 운영 컨테이너 로그에서 상태를 확인한다.
2. DB 백업 파일을 빈 복구 DB에 복원하고 posts 수를 비교한다.
3. CI 로그에서 실패가 발행을 막는 경로를 찾는다.

## ☐ 체크리스트

- [ ] Docker 이미지와 Compose 의존 관계를 검증했다.
- [ ] CI 검사와 SHA 이미지 배포 경로를 확인했다.
- [ ] 백업·복구·로그·헬스 체크를 시험했다.

## 다음 단계

운영 서버가 브라우저에 게시판 변경을 보내고 업로드를 처리하게 한다. [study17](study17.md)

[공식 문서](https://docs.github.com/en/actions)
