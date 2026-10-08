import { simpleCamelcaseKeys } from '@mx-space/api-client'
import { useQuery } from '@tanstack/react-query'
import { nanoid } from 'nanoid'
import { useEffect } from 'react'

import { fetchAppUrl, isLoggedAtom } from '~/atoms'
import { setSessionReader } from '~/atoms/hooks/reader'
import { getToken } from '~/lib/cookie'
import { checkOwner } from '~/lib/owner-auth'
import { apiClient } from '~/lib/request'
import { jotaiStore } from '~/lib/store'
import type { SessionReader } from '~/models/session'

type AdapterUser = SessionReader | null
export const AuthSessionProvider: Component = ({ children }) => {
  const { data: session } = useQuery({
    queryKey: ['session'],
    meta: { persist: false },
    refetchOnMount: 'always',
    queryFn: () =>
      apiClient.proxy.auth.session.get<AdapterUser>({
        params: {
          r: nanoid(),
        },
      }),
  })

  useEffect(() => {
    if (session === undefined) return
    const reader = session ? simpleCamelcaseKeys(session) : null
    setSessionReader(reader)
    // Core v14 identifies the owner with role, as in Cyber's session provider.
    const owner = reader?.role === 'owner'
    if (owner || !getToken()) jotaiStore.set(isLoggedAtom, owner)
    if (owner) void fetchAppUrl()
    // API tokens have no reader session, but can still grant owner access.
    if (!owner && getToken()) {
      let active = true
      void checkOwner(apiClient)
        .then((ok) => {
          if (active) jotaiStore.set(isLoggedAtom, ok)
        })
        .catch(() => {})
      return () => {
        active = false
      }
    }
  }, [session])
  return children
}
