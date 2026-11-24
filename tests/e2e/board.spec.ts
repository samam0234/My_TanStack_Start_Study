import { randomUUID } from 'node:crypto'
import { expect, request as http, test } from '@playwright/test'

test('protected route and browser CRUD with comments', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/posts/new')
  await expect(page).toHaveURL(/\/login/)
  await page.getByRole('button', { name: '회원가입' }).click()
  await page.getByLabel('별명').fill('학습자')
  await page.getByLabel('이메일').fill(randomUUID() + '@example.com')
  await page.getByLabel('비밀번호').fill('test-only-password')
  await page.getByRole('button', { name: '가입하기' }).click()
  await expect(page.getByRole('status')).toContainText('가입이 완료')
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page.getByRole('heading', { name: '내 계정' })).toBeVisible()

  await page.getByRole('link', { name: '게시판' }).click()
  await expect(page.getByText('실시간 업데이트 연결됨')).toBeVisible()
  await page.getByRole('link', { name: '글쓰기' }).click()
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('alert')).toContainText('입력값')
  const title = 'SSR 검증 ' + randomUUID()
  await page.getByLabel('제목').fill(title)
  await page.getByLabel('본문').fill('<b>문자열 본문</b>')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByText('<b>문자열 본문</b>')).toBeVisible()
  await page.getByLabel('댓글 내용').fill('실습 댓글')
  await page.getByRole('button', { name: '댓글 작성' }).click()
  await expect(page.getByText('실습 댓글')).toBeVisible()
  await page.getByRole('button', { name: '댓글 삭제' }).click()
  await expect(page.getByText('실습 댓글')).toHaveCount(0)

  await page.getByRole('button', { name: '편집', exact: true }).click()
  await page.getByLabel('제목').fill(title + ' 수정')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('heading', { name: title + ' 수정' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: title + ' 수정' })).toBeVisible()
  await page.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '삭제 확인' }).click()
  await expect(page.getByRole('heading', { name: '게시판', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('API v1 envelopes, bearer/cookie auth and ownership', async ({ request, baseURL }) => {
  async function register() {
    const isolated = await http.newContext({ baseURL })
    try {
      const email = randomUUID() + '@example.com'
      const password = 'test-only-password'
      const signup = await isolated.post('/api/auth/signup', { data: { email, password, nickname: 'tester' } })
      expect(signup.status()).toBe(201)
      const login = await isolated.post('/api/auth/login', { data: { email, password } })
      expect(login.status()).toBe(200)
      expect(login.headers()['set-cookie']).toContain('HttpOnly')
      expect((await isolated.get('/api/auth/me')).status()).toBe(200)
      return { Authorization: 'Bearer ' + (await login.json()).data.accessToken }
    } finally { await isolated.dispose() }
  }

  const author = await register()
  const other = await register()
  const invalid = await request.post('/api/posts', {
    headers: { ...author, 'X-Request-Id': 'study-invalid' }, data: { title: '', body: 'a' },
  })
  expect(invalid.status()).toBe(400)
  expect((await invalid.json()).error).toMatchObject({
    code: 'VALIDATION_ERROR', requestId: 'study-invalid', fields: { title: expect.any(Array) },
  })
  const created = await request.post('/api/posts', { headers: author, data: { title: 'Literal % search', body: 'board', tags: ['api'] } })
  expect(created.status()).toBe(201)
  const path = created.headers().location
  expect(path).toMatch(/^\/api\/posts\/\d+$/)
  expect((await request.patch(path, { headers: other, data: { title: 'other' } })).status()).toBe(403)
  expect((await request.patch(path, { headers: { ...author, Origin: 'https://other.invalid' }, data: { title: 'other' } })).status()).toBe(403)
  const listing = await request.get('/api/posts?q=%25&page=1&limit=100')
  expect(await listing.json()).toMatchObject({ data: expect.any(Array), meta: { page: 1, limit: 50, total: 1, q: '%' } })
  expect((await request.post('/api/documents/demo/answer', { headers: author, data: { question: 'x'.repeat(501) } })).status()).toBe(422)
  expect((await request.delete(path, { headers: author })).status()).toBe(204)
  expect((await request.get(path)).status()).toBe(404)
  expect((await request.get('/api/posts/not-a-number')).status()).toBe(400)
  expect((await request.post('/api/auth/logout', { headers: other })).status()).toBe(204)
  expect((await request.get('/api/auth/me', { headers: other })).status()).toBe(401)
})

test('Swagger renders the v1 contract', async ({ page }) => {
  await page.goto('/api-docs')
  await expect(page.getByText('/api/posts', { exact: true }).first()).toBeVisible()
})

test('a websocket change refreshes the list in a different client', async ({ page, request }) => {
  await page.goto('/posts')
  await expect(page.getByText('실시간 업데이트 연결됨')).toBeVisible()
  const email = randomUUID() + '@example.com'
  const password = 'test-only-password'
  await request.post('/api/auth/signup', { data: { email, password, nickname: 'ws-reader' } })
  await request.post('/api/auth/login', { data: { email, password } })
  const title = '실시간 반영 ' + randomUUID()
  const created = await request.post('/api/posts', { data: { title, body: 'WebSocket 확인' } })
  expect(created.status()).toBe(201)
  await expect(page.getByRole('link', { name: title })).toBeVisible({ timeout: 10_000 })
  expect((await request.delete(created.headers().location)).status()).toBe(204)
})
