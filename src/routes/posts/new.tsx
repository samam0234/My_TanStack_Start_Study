import { createFileRoute, redirect } from '@tanstack/react-router'
import { PostEditor } from '../../board/post-editor'

export const Route = createFileRoute('/posts/new')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/login' })
  },
  component: () => <section><h1>글쓰기</h1><PostEditor /></section>,
})
