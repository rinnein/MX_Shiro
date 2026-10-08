'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { StyledButton } from '~/components/ui/button'
import { Input } from '~/components/ui/input/Input'
import { getErrorMessageFromRequestError } from '~/lib/request.shared'
import { Routes } from '~/lib/route-builder'
import { toast } from '~/lib/toast'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleLogin = async (e: any) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      const { login } = await import('~/atoms/owner')
      await login(username, password)
      const redirectPath = new URLSearchParams(location.search).get('redirect')
      router.push(
        redirectPath?.startsWith('/') && !redirectPath.startsWith('//')
          ? redirectPath
          : Routes.Home,
      )
      router.refresh()
    } catch (error) {
      toast.error(getErrorMessageFromRequestError(error as any))
    } finally {
      setIsSubmitting(false)
    }
  }
  return (
    <div className="center flex min-h-[calc(100vh-7rem)]">
      <form className="flex flex-col space-y-5" onSubmit={handleLogin}>
        <Input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          type="text"
          placeholder="Username"
        />
        <Input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Password"
        />

        <div className="center flex">
          <StyledButton
            type="submit"
            disabled={isSubmitting || !username || !password}
          >
            Login
          </StyledButton>
        </div>
      </form>
    </div>
  )
}
