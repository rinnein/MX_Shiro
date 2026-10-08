import type { HTTPClient } from '@mx-space/api-client'

export const checkOwner = async (client: Pick<HTTPClient, 'proxy'>) => {
  const result = await client.proxy.owner.check_logged.get<{ ok: number }>()
  return result.ok === 1
}

export const signInOwner = (
  client: Pick<HTTPClient, 'proxy'>,
  username: string,
  password: string,
) =>
  client.proxy.auth('sign-in').username.post<{ token: string }>({
    data: { username, password, rememberMe: true },
  })
