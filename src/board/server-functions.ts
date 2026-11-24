import { queryOptions } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { validateSearch } from './contracts'
import type { Search } from './contracts'
import { viewer } from '../server/board-api'
import { database } from '../server/database'
import { ApiError } from '../server/errors'
import { getPost, listPosts } from '../server/posts'

export const getViewer = createServerFn({ method: 'GET' }).handler(() => {
  setResponseHeader('Cache-Control', 'private, no-store')
  return viewer(getRequest())
})

export const getPosts = createServerFn({ method: 'GET' })
  .validator((data: Search) => validateSearch(data))
  .handler(async ({ data }) => listPosts(await database(), data))

export const getPostDetail = createServerFn({ method: 'GET' })
  .validator(z.number().int().min(1).max(2_147_483_647))
  .handler(async ({ data }) => {
    try { return await getPost(await database(), data) }
    catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound()
      throw error
    }
  })

export function postsQuery(search: Search) {
  return queryOptions({ queryKey: ['posts', search], queryFn: () => getPosts({ data: search }) })
}
