import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/hello')({ component: Hello })

function Hello() {
  const name = 'TanStack Start'
  const topics = ['라우팅', '서버 렌더링']
  return (
    <section>
      <h1>Hello, {name}!</h1>
      {topics.length > 0 && <ul>{topics.map((topic) => <li key={topic}>{topic}</li>)}</ul>}
    </section>
  )
}
