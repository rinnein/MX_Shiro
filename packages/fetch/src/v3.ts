import type { IRequestAdapter } from '@mx-space/api-client-v3'
import createClient from '@mx-space/api-client-v3'
import type { $fetch } from 'ofetch'

export interface CoreResponse<T> {
  data: T
  meta?: {
    pagination?: {
      page: number
      totalPages: number
      total: number
      size: number
    }
  }
}

// New consumers keep the v3 envelope, while existing pages use the legacy
// adapter. Share the authenticated fetch instance, never a second session.
export const createV3Client = (fetcher: typeof $fetch, endpoint: string) => {
  const request = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    options?: any,
  ) =>
    fetcher(url, {
      method,
      query: options?.params,
      body: options?.data,
      retry: 0,
      cache: 'no-store',
    })
  const adapter: IRequestAdapter<typeof $fetch> = {
    default: fetcher,
    get: (url, options) => request('GET', url, options),
    post: (url, options) => request('POST', url, options),
    put: (url, options) => request('PUT', url, options),
    patch: (url, options) => request('PATCH', url, options),
    delete: (url, options) => request('DELETE', url, options),
  }
  return createClient(adapter)(endpoint, {
    controllers: [],
    getDataFromResponse: (body) => body as any,
  })
}
