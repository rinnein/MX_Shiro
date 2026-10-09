'use client'

import Link from 'next/link'

import { useIsClient } from '~/hooks/common/use-is-client'
import { getOAuthErrorMessage, getOAuthReturnUrl } from '~/lib/oauth-login'
import { AuthProvidersRender } from '~/queries/hooks/authjs'

export default function OAuthErrorPage({
  searchParams,
}: {
  searchParams: { error?: string | string[] }
}) {
  const isClient = useIsClient()
  const error =
    typeof searchParams.error === 'string' ? searchParams.error : undefined
  const returnUrl = isClient ? getOAuthReturnUrl(window.location.href) : null
  return (
    <div className="center flex min-h-[calc(100vh-7rem)] px-6">
      <div className="max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-semibold">登录未完成</h1>
        <p role="alert" className="text-base-content/70">
          {getOAuthErrorMessage(error)}
        </p>
        <div className="space-y-3">
          <p className="text-sm">重新选择登录方式</p>
          <AuthProvidersRender />
        </div>
        <Link
          className="inline-block text-sm text-accent"
          href={
            returnUrl
              ? `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`
              : '/'
          }
        >
          返回原页面
        </Link>
      </div>
    </div>
  )
}
