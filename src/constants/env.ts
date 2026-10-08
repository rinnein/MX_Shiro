import { env } from 'next-runtime-env'

import { isClientSide, isDev } from '~/lib/env'

import { normalizeCoreApiUrl } from '../../packages/fetch/src/endpoint'

export const API_URL: string = (() => {
  if (isDev) return normalizeCoreApiUrl(env('NEXT_PUBLIC_API_URL') || '/api/v3')

  if (isClientSide && env('NEXT_PUBLIC_CLIENT_API_URL')) {
    return normalizeCoreApiUrl(env('NEXT_PUBLIC_CLIENT_API_URL') || '')
  }

  return normalizeCoreApiUrl(env('NEXT_PUBLIC_API_URL') || '/api/v3')
})() as string
export const GATEWAY_URL = env('NEXT_PUBLIC_GATEWAY_URL') || ''
