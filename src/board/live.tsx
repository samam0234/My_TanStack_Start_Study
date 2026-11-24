import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function LiveUpdates() {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let socket: WebSocket | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    let previous: string | undefined
    let wait = 1000

    function connect() {
      const url = new URL('/ws/board', window.location.href)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(url)
      socket.onopen = () => { wait = 1000; setConnected(true) }
      socket.onmessage = ({ data }) => {
        if (typeof data !== 'string') return
        if (previous !== undefined && previous !== data) void queryClient.invalidateQueries({ queryKey: ['posts'] })
        previous = data
      }
      socket.onclose = () => {
        if (disposed) return
        setConnected(false)
        timer = setTimeout(connect, wait)
        wait = Math.min(wait * 2, 15_000)
      }
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(timer)
      socket?.close()
    }
  }, [queryClient])

  return <span className="muted" aria-live="polite">{connected ? '실시간 업데이트 연결됨' : '실시간 연결 대기 중'}</span>
}
