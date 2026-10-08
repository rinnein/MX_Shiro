'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import type { FC, PropsWithChildren } from 'react'
import { useEffect } from 'react'

import { PageLoading } from '~/components/layout/dashboard/PageLoading'
import { checkOwner } from '~/lib/owner-auth'
import { apiClient } from '~/lib/request'
import { toast } from '~/lib/toast'

export const AuthProvider: FC<PropsWithChildren> = ({ children }) => {
  const { data: ok, isLoading } = useQuery({
    queryKey: ['check-auth'],
    meta: { persist: false },
    // 5 min ,
    refetchInterval: 5 * 60 * 1000,
    queryFn: () => checkOwner(apiClient),
  })
  const router = useRouter()
  useEffect(() => {
    if (!isLoading && !ok) {
      toast.error('请先登录站长账号')
      router.replace('/login')
    }
  }, [isLoading, ok, router])
  if (isLoading) return <PageLoading />
  if (!ok) return null

  return children
}
