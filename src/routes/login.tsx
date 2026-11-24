import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useRef, useState, type FormEvent } from 'react'
import { api, ClientError, errorMessage, jsonRequest } from '../board/client'

export const Route = createFileRoute('/login')({ component: Login })

function Login() {
  const router = useRouter()
  const [signup, setSignup] = useState(false)
  const [message, setMessage] = useState('')
  const [fields, setFields] = useState<Record<string, string[]>>({})
  const [pending, setPending] = useState(false)
  const locked = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current) return
    locked.current = true
    const data = new FormData(event.currentTarget)
    const credentials = { email: data.get('email'), password: data.get('password') }
    setPending(true)
    setMessage('')
    setFields({})
    try {
      if (signup) {
        await api('/auth/signup', jsonRequest('POST', { ...credentials, nickname: data.get('nickname') }))
        setSignup(false)
        setMessage('가입이 완료되었습니다. 로그인하세요.')
      } else {
        await api('/auth/login', jsonRequest('POST', credentials))
        await router.invalidate()
        await router.navigate({ to: '/account' })
      }
    } catch (error) {
      if (error instanceof ClientError) setFields(error.details.fields ?? {})
      setMessage(errorMessage(error))
    } finally {
      locked.current = false
      setPending(false)
    }
  }

  return <section className="narrow stack">
    <h1>{signup ? '회원가입' : '로그인'}</h1>
    <form className="panel stack" onSubmit={submit}>
      {signup && <label>별명<input name="nickname" required maxLength={50} />
        {fields.nickname && <span className="error">{fields.nickname.join(' ')}</span>}</label>}
      <label>이메일<input name="email" type="email" required autoComplete="email" />
        {fields.email && <span className="error">{fields.email.join(' ')}</span>}</label>
      <label>비밀번호<input name="password" type="password" required minLength={8} maxLength={128}
        autoComplete={signup ? 'new-password' : 'current-password'} />
        {fields.password && <span className="error">{fields.password.join(' ')}</span>}</label>
      <button type="submit" disabled={pending}>{signup ? '가입하기' : '로그인'}</button>
    </form>
    {message && <p role="status">{message}</p>}
    <div className="actions">
      <button className="secondary" disabled={pending} onClick={() => { setSignup(!signup); setMessage(''); setFields({}) }}>
        {signup ? '로그인 화면으로' : '회원가입'}
      </button>
      <a href="/api/oauth/github">GitHub 로그인</a>
    </div>
  </section>
}
