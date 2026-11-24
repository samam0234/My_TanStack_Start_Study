import '@tanstack/react-start/server-only'
import { validateSearch } from '../board/contracts'
import { currentUser, issueSession, login, requireUser, revokeSession, sessionCookie, signup } from './auth'
import { database } from './database'
import { notFound, positiveId } from './errors'
import { json, readJson, respond } from './http'
import { createComment, createPost, deleteOwned, getPost, listComments, listPosts, updatePost } from './posts'
import { rateLimit } from './rate-limit'
import { extensions } from './extensions'

export function boardApi(request: Request, path: string) {
  return respond(request, async () => {
    const method = request.method
    const [resource, id, child, extra] = path.split('/')
    if (extra !== undefined) throw notFound()

    if (resource === 'auth' && !child) {
      const db = await database()
      if (method === 'POST' && id === 'signup') {
        rateLimit('signup', 60)
        return json({ data: await signup(db, await readJson(request)) }, 201)
      }
      if (method === 'POST' && id === 'login') {
        rateLimit('login', 120)
        const user = await login(db, await readJson(request))
        await revokeSession(db, request)
        const accessToken = await issueSession(db, user.id)
        return json({ data: { user, accessToken } }, 200, { 'Set-Cookie': sessionCookie(accessToken) })
      }
      if (method === 'POST' && id === 'logout') {
        await requireUser(db, request)
        await revokeSession(db, request)
        return new Response(null, { status: 204, headers: { 'Set-Cookie': sessionCookie('', 0) } })
      }
      if (method === 'GET' && id === 'me') {
        return json({ data: await requireUser(db, request) })
      }
    }

    if (resource === 'posts') {
      const db = await database()
      if (!id && method === 'GET') {
        return json(await listPosts(db, validateSearch(Object.fromEntries(new URL(request.url).searchParams))))
      }
      if (!id && method === 'POST') {
        const user = await requireUser(db, request)
        const post = await createPost(db, user.id, await readJson(request))
        return json({ data: post }, 201, { Location: '/api/posts/' + post.id })
      }
      if (id && child === 'comments' && method === 'GET') {
        return json({ data: await listComments(db, positiveId(id)) })
      }
      if (id && child === 'comments' && method === 'POST') {
        const user = await requireUser(db, request)
        return json({ data: await createComment(db, user.id, positiveId(id), await readJson(request)) }, 201)
      }
      if (id && !child && method === 'GET') return json({ data: await getPost(db, positiveId(id)) })
      if (id && !child && method === 'PATCH') {
        const user = await requireUser(db, request)
        return json({ data: await updatePost(db, user.id, positiveId(id), await readJson(request)) })
      }
      if (id && !child && method === 'DELETE') {
        const user = await requireUser(db, request)
        await deleteOwned(db, 'posts', user.id, positiveId(id))
        return new Response(null, { status: 204 })
      }
    }

    if (resource === 'comments' && id && !child && method === 'DELETE') {
      const db = await database()
      const user = await requireUser(db, request)
      await deleteOwned(db, 'comments', user.id, positiveId(id))
      return new Response(null, { status: 204 })
    }
    return extensions(request, resource, id, child)
  })
}

export async function viewer(request: Request) {
  if (!request.headers.has('cookie') && !request.headers.has('authorization')) return null
  return currentUser(await database(), request)
}
