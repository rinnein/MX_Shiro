import type { IRequestAdapter } from '@mx-space/api-client'
import { simpleCamelcaseKeys } from '@mx-space/api-client-v3'
import { legacyResponseAdapter } from '@mx-space/api-client-v3/legacy'
import type { $fetch } from 'ofetch'

const legacyAdapter = legacyResponseAdapter()
const isObject = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// Following Cyber (At87668/Cyber), keep envelope and timestamp conversion
// at the request boundary instead of changing every Shiro page.
// Keep Shiro's v1 SDK models at the UI boundary. The official v3 adapter
// handles response envelopes, pagination, note navigation and interaction meta;
// these aliases cover the database field renames introduced since Core v12.
export const normalizeCoreModel = (value: any): any => {
  if (Array.isArray(value)) return value.map(normalizeCoreModel)
  if (!isObject(value)) return value
  const result: Record<string, any> = {}
  for (const [key, child] of Object.entries(value)) {
    // User-defined data must not be interpreted as Core models.
    result[key] = ['theme', 'meta', 'settings', 'dataSource'].includes(key)
      ? child
      : normalizeCoreModel(child)
  }
  if ('createdAt' in result) result.created = result.createdAt
  if ('modifiedAt' in result) result.modified = result.modifiedAt
  if ('readCount' in result || 'likeCount' in result) {
    result.count = { read: result.readCount ?? 0, like: result.likeCount ?? 0 }
  }
  if ('pinAt' in result) result.pin = result.pinAt
  if ('isPublished' in result && 'nid' in result)
    result.hide = !result.isPublished
  if (
    result.id &&
    ('text' in result || 'content' in result) &&
    !('refId' in result)
  ) {
    result.allowComment ??= true
  }
  if ('refId' in result) result.ref ??= result.refId
  if ('refId' in result && 'text' in result) {
    result.source = result.authProvider
    result.parent ??= result.parentCommentId
    result.ref ??= result.refId
    result.author ??= result.reader?.name ?? ''
    result.avatar ??= result.reader?.image
    result.children = result.replies ?? result.children
  }
  return result
}

export const getCorePath = (url: string) =>
  new URL(url, 'http://shiro.local').pathname.replace(
    /^.*\/api\/v[23](?=\/|$)/,
    '',
  ) || '/'

export const normalizeCoreResponse = (
  url: string,
  response: unknown,
  method = 'GET',
): any => {
  const path = getCorePath(url)
  const body = simpleCamelcaseKeys(response, {
    shouldSkipKey: (key) => /^https?:\/\//.test(key),
  }) as any
  // Better Auth endpoints deliberately return their own raw protocol.
  if (!isObject(body) || !('data' in body)) return normalizeCoreModel(body)

  const readers: Record<string, any> = {}
  const collectReaders = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (node.reader?.id) readers[node.reader.id] = node.reader
    if (Array.isArray(node)) node.forEach(collectReaders)
    else {
      if (node.data) collectReaders(node.data)
      if (node.replies) collectReaders(node.replies)
    }
  }
  if (path.startsWith('/comments/')) collectReaders(body.data)

  // Keep the thread cursor, which the official legacy adapter intentionally
  // removes for older themes without a "load more replies" control.
  const adapted = path.startsWith('/comments/thread/')
    ? body.data
    : legacyAdapter.transformData!(
        body.meta?.pagination && Array.isArray(body.data)
          ? { data: body.data, pagination: body.meta.pagination }
          : body,
        {
          url,
          path,
          method,
          options: {},
          response: body,
          meta: body.meta,
        },
      )
  const result = normalizeCoreModel(adapted)
  if (isObject(result) && body.meta) result.responseMeta = body.meta
  // Detail controllers explicitly bypass case conversion for user metadata.
  if (
    /^\/posts\/[^/]+(?:\/[^/]+)?$/.test(path) &&
    isObject(response) &&
    isObject(response.data) &&
    response.data.id &&
    'meta' in response.data &&
    isObject(result)
  )
    result.meta = response.data.meta
  if (/^\/comments\/ref\//.test(path)) {
    result.readers = { ...result.readers, ...readers }
  }
  // The old options client expects its configuration under `data`.
  if (/^\/options\/[^/]+$/.test(path)) return { data: result }
  return result
}

export const normalizeCoreRequest = (
  url: string,
  method: string,
  data?: any,
) => {
  const parsed = new URL(url, 'http://shiro.local')
  const originalPath = getCorePath(url)
  if (/^\/(?:master|user)(?=\/|$)/.test(originalPath)) {
    parsed.pathname =
      parsed.pathname.slice(0, -originalPath.length) +
      originalPath.replace(/^\/(?:master|user)(?=\/|$)/, '/owner')
  }
  const sort = parsed.searchParams.get('sortBy')
  if (sort === 'created' || sort === 'modified')
    parsed.searchParams.set('sortBy', `${sort}At`)
  const path = getCorePath(parsed.toString())
  let body = data
  if (isObject(data) && /^\/(?:posts|notes)(?:\/[^/]+)?$/.test(path)) {
    body = { ...data }
    if ('hide' in body) {
      body.isPublished = !body.hide
      delete body.hide
    }
    if (method === 'PATCH' && path.startsWith('/posts/') && 'pin' in body) {
      body.pinAt = body.pin
      delete body.pin
    }
  }
  return {
    url: /^https?:\/\//.test(url)
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}`,
    data: body,
  }
}

export const createCoreFetchAdapter = (
  fetcher: typeof $fetch,
): IRequestAdapter<typeof $fetch> => {
  const request = async (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    options?: any,
  ) => {
    const normalized = normalizeCoreRequest(url, method, options?.data)
    const response = await fetcher(normalized.url, {
      method,
      query: options?.params,
      body: normalized.data,
      // Never replay writes, including comment submissions and password login.
      retry: method === 'GET' ? 1 : 0,
    })
    const result = normalizeCoreResponse(normalized.url, response, method)
    if (method === 'GET' && getCorePath(normalized.url) === '/aggregate') {
      const base = normalized.url.split('?')[0].replace(/\/aggregate\/?$/, '')
      const [pages, categories] = await Promise.all([
        request('GET', `${base}/pages?size=100`),
        request('GET', `${base}/categories?type=Category`),
      ])
      const pageItems = [...pages.data]
      let pageResult = pages
      while (pageResult.pagination?.hasNextPage) {
        pageResult = await request(
          'GET',
          `${base}/pages?size=100&page=${pageResult.pagination.currentPage + 1}`,
        )
        pageItems.push(...pageResult.data)
      }
      result.pageMeta = pageItems.map(({ id, title, slug, subtitle }: any) => ({
        id,
        title,
        slug,
        subtitle,
      }))
      result.categories = categories.data
    }
    return result
  }
  return {
    default: fetcher,
    get: (url, options) => request('GET', url, options),
    post: (url, options) => request('POST', url, options),
    put: (url, options) => request('PUT', url, options),
    patch: (url, options) => request('PATCH', url, options),
    delete: (url, options) => request('DELETE', url, options),
  }
}
