import { useMutation } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'

import { removeToken } from '~/lib/cookie'
import { checkOwner } from '~/lib/owner-auth'
import { apiClient } from '~/lib/request'
import { jotaiStore } from '~/lib/store'

import { isLoggedAtom, ownerAtom } from '../owner'
import { fetchAppUrl } from '../url'

export const useIsLogged = () => useAtomValue(isLoggedAtom)

export const useOwner = () => useAtomValue(ownerAtom)
export const useRefreshToken = () => {
  return useMutation({
    mutationKey: ['refreshToken'],
    mutationFn: refreshToken,
  })
}

// Better Auth refreshes sessions itself; the removed PUT /master/login must
// not be called when opening the site or refreshing the admin session.
export const refreshToken = async () => {
  const owner = await checkOwner(apiClient)
  jotaiStore.set(isLoggedAtom, owner)
  if (!owner) {
    removeToken()
    return
  }
  await fetchAppUrl()
}
