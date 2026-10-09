import type { AggregateRoot } from '@mx-space/api-client'
import createClient, { AggregateController } from '@mx-space/api-client'
import { $fetch } from 'ofetch'
import { cache } from 'react'

import { appStaticConfig } from '~/app.static.config'
import { attachServerFetch } from '~/lib/attach-fetch'
import { getQueryClient } from '~/lib/query-client.server'
import { apiClient } from '~/lib/request'

import { createCoreFetchAdapter } from '../../../packages/fetch/src/core-compat'

const cacheTime = appStaticConfig.cache.enabled
  ? appStaticConfig.cache.ttl.aggregation
  : 1
export const fetchAggregationData = cache(async () => {
  attachServerFetch()
  const queryClient = getQueryClient()
  const client = createClient(
    createCoreFetchAdapter(
      $fetch.create({
        next: { revalidate: cacheTime, tags: ['aggregate', 'shiro'] },
      }),
    ),
  )(apiClient.proxy.toString(true), {
    controllers: [AggregateController],
    getDataFromResponse: (response) => response as any,
    transformResponse: (body) => body,
  })
  const fetcher = async () =>
    (await client.aggregate.getAggregateData('shiro'))
      .$serialized as AggregateRoot & { theme: AppThemeConfig }

  return queryClient.fetchQuery({
    queryKey: ['aggregate', 'shiro'],
    queryFn: fetcher,
    staleTime: cacheTime,
    gcTime: cacheTime,
  })
})
