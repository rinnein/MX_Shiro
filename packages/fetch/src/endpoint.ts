// Core v14 only serves v3. Accept existing Shiro deployments configured with
// a v2 URL, while keeping custom reverse-proxy prefixes intact.
export const normalizeCoreApiUrl = (url: string) =>
  url.replace(/\/+$/, '').replace(/\/api\/v2$/, '/api/v3')

export const getCoreSocketUrl = (gateway: string, origin: string) => {
  const url = new URL(gateway || '/', origin)
  url.protocol =
    url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/ws/web`
  return url.toString()
}
