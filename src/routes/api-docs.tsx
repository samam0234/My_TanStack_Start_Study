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
