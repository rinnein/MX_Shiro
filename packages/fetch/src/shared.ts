import createClient, { allControllers } from '@mx-space/api-client'
import Cookies from 'js-cookie'

import { API_URL } from '~/constants/env'

import type { createCoreFetchAdapter } from './core-compat'

export { createCoreFetchAdapter as createFetchAdapter } from './core-compat'

export const createApiClient = (
  fetchAdapter: ReturnType<typeof createCoreFetchAdapter>,
) =>
  createClient(fetchAdapter)(API_URL, {
    controllers: allControllers,
    transformResponse: (body) => body,
    getDataFromResponse(response) {
      return response as any
    },
  })

export const TokenKey = 'mx-token'

export const AuthKeyNames = [TokenKey]

export function getToken(): string | null {
  const token = Cookies.get(TokenKey)

  return token || null
}
