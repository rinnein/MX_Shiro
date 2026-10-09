import { InvalidSignatureError } from '@mx-space/webhook'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { NextRequest } from 'next/server'

import { CacheKeyMap } from '~/constants/keys'
import { invalidateCache, invalidateCacheWithPrefix } from '~/lib/cache'
import { invalidatesContent, readCoreWebhook } from '~/lib/core-webhook'
import { NextServerResponse } from '~/lib/edge-function.server'

export const POST = async (nextreq: NextRequest) => {
  const secret = process.env.WEBHOOK_SECRET
  const res = new NextServerResponse()
  if (!secret) return res.status(500).send('WEBHOOK_SECRET is not set')
  try {
    const { type } = readCoreWebhook(
      nextreq.headers,
      await nextreq.json(),
      secret,
    )
    if (type === 'health_check') return res.status(200).send('OK')
    if (!invalidatesContent(type)) return res.status(200).send('MISS')
    await Promise.all([
      invalidateCacheWithPrefix(CacheKeyMap.PostList),
      invalidateCache(CacheKeyMap.AggregateTop),
      invalidateCache(CacheKeyMap.RootData),
    ])
    revalidateTag('aggregate')
    revalidateTag('shiro')
    revalidatePath('/', 'layout')
    return res.status(200).send('OK')
  } catch (err) {
    if (err instanceof InvalidSignatureError) {
      return res.status(400).send(err.message)
    } else {
      console.error(err)
      return res
        .status(500)
        .send('An error occurred while processing the request')
    }
  }
}
