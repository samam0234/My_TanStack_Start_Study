import { z } from 'zod'

const postFields = z.object({
  title: z.string().trim().min(1, '제목을 입력하세요.').max(200),
  body: z.string().trim().min(1, '본문을 입력하세요.').max(20_000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10),
}).strict()
export const postInput = postFields.extend({ tags: postFields.shape.tags.default([]) })
export const postPatch = postFields.partial().refine((value) => Object.keys(value).length > 0, {
  message: '수정할 필드를 하나 이상 보내세요.',
})
export const loginInput = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(8).max(128),
})
export const signupInput = loginInput.extend({ nickname: z.string().trim().min(1).max(50) })
export const commentInput = z.object({ body: z.string().trim().min(1).max(1000) })
export const sortOptions = ['-createdAt', 'createdAt', '-commentCount'] as const
const searchInput = z.object({
  q: z.string().trim().max(200).catch('').default(''),
  page: z.coerce.number().int().positive().max(1_000_000).catch(1).default(1),
  limit: z.coerce.number().int().positive().catch(10).default(10).transform((value) => Math.min(value, 50)),
  sort: z.enum(sortOptions).catch('-createdAt').default('-createdAt'),
})
export function validateSearch(raw: Record<string, unknown>) {
  return searchInput.parse(raw)
}
export type Search = ReturnType<typeof validateSearch>
export type User = { id: number; email: string; nickname: string }
export type Author = Pick<User, 'id' | 'nickname'>
export type PostSummary = { id: number; title: string; author: Author; commentCount: number; createdAt: string }
export type Post = PostSummary & { body: string; tags: string[]; updatedAt: string }
export type Comment = { id: number; body: string; author: Author; createdAt: string }
export type PostList = {
  data: PostSummary[]
  meta: { page: number; limit: number; total: number; totalPages: number; q: string }
}
export type ErrorBody = { code: string; message: string; fields?: Record<string, string[]>; requestId: string }
