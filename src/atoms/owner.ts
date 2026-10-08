import { atom } from 'jotai'

import { removeToken, setToken } from '~/lib/cookie'
import { checkOwner, signInOwner } from '~/lib/owner-auth'
import { apiClient } from '~/lib/request'
import { jotaiStore } from '~/lib/store'
import { toast } from '~/lib/toast'
import { aggregationDataAtom } from '~/providers/root/aggregation-data-provider'

import { fetchAppUrl } from './url'

export const ownerAtom = atom((get) => {
  return get(aggregationDataAtom)?.user
})
export const isLoggedAtom = atom(false)

export const login = async (username?: string, password?: string) => {
  if (username && password) {
    const session = await signInOwner(apiClient, username, password)
    // Better Auth's bearer plugin accepts this session token. Retain it for
    // server rendering when the API cookie belongs to a different subdomain.
    setToken(session.token)
    const owner = await checkOwner(apiClient)
    jotaiStore.set(isLoggedAtom, owner)
    if (!owner) {
      removeToken()
      throw new Error('该账号不是站长账号')
    }
    await fetchAppUrl()
    toast.success(`欢迎回来，${jotaiStore.get(ownerAtom)?.name}`)
    return true
  }

  const owner = await checkOwner(apiClient)
  jotaiStore.set(isLoggedAtom, owner)
  if (!owner) {
    removeToken()
    return false
  }
  await fetchAppUrl()
  return true
}

export const isLogged = () => jotaiStore.get(isLoggedAtom)
