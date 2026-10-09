const errorPath = '/auth/error'

export const getOAuthReturnUrl = (currentUrl: string) => {
  const current = new URL(currentUrl)
  if (current.pathname !== errorPath) return current

  try {
    const target = new URL(
      current.searchParams.get('returnTo') || '/',
      current.origin,
    )
    if (
      target.origin === current.origin &&
      target.pathname.replace(/\/$/, '') !== errorPath &&
      !target.username &&
      !target.password
    )
      return target
  } catch {
    // An invalid returnTo must still leave the user a working retry page.
  }
  return new URL('/', current.origin)
}

export const getSocialSignInOptions = <T extends string>(
  provider: T,
  currentUrl: string,
) => {
  const callback = getOAuthReturnUrl(currentUrl)
  const errorCallback = new URL(errorPath, callback.origin)
  errorCallback.searchParams.set(
    'returnTo',
    `${callback.pathname}${callback.search}${callback.hash}`,
  )
  return {
    provider,
    callbackURL: callback.href,
    newUserCallbackURL: callback.href,
    errorCallbackURL: errorCallback.href,
  }
}

// State updates alone cannot guard two clicks in the same render. Keep the
// in-flight guard synchronous and release it when starting authorization fails.
export const createSocialSignIn = <T>(
  request: (options: T) => Promise<{ error?: { message?: string } | null }>,
) => {
  let pending: Promise<void> | undefined
  return (options: T) => {
    if (pending) return pending
    pending = request(options)
      .then((result) => {
        if (result.error)
          throw new Error(result.error.message || '暂时无法登录，请稍后重试')
      })
      .finally(() => {
        pending = undefined
      })
    return pending
  }
}

export const getOAuthErrorMessage = (error?: string) => {
  switch (error) {
    case 'invalid_code': {
      return '授权码验证失败，请重新发起登录。若仍然失败，请联系站长检查登录服务。'
    }
    case 'access_denied': {
      return '你取消了授权，可以重新选择登录方式。'
    }
    case 'state_mismatch':
    case 'state_not_found':
    case 'state_expired': {
      return '这次登录已失效，请重新发起登录。'
    }
    default: {
      return '暂时无法完成登录，请重新尝试。'
    }
  }
}
