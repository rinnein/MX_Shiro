import assert from 'node:assert/strict'
import { test } from 'node:test'

import createClient from '@mx-space/api-client'
import { $fetch } from 'ofetch'

import { createCoreFetchAdapter } from '../../packages/fetch/src/core-compat.ts'
import { checkOwner, signInOwner } from './owner-auth.ts'

test('uses Better Auth username login and verifies owner access independently', async () => {
  const calls = []
  const client = createClient(
    createCoreFetchAdapter(
      $fetch.create(
        {},
        {
          fetch: async (url, options) => {
            calls.push({ url: String(url), options })
            return new Response(
              JSON.stringify(
                String(url).includes('sign-in')
                  ? { token: 'test-token' }
                  : { data: { ok: 0, is_guest: true } },
              ),
              { headers: { 'content-type': 'application/json' } },
            )
          },
        },
      ),
    ),
  )('https://api.example.com/api/v3', {
    controllers: [],
    getDataFromResponse: (body) => body,
  })
  assert.equal(
    (await signInOwner(client, 'owner', 'test-password')).token,
    'test-token',
  )
  assert.equal(await checkOwner(client), false)
  assert.equal(
    calls[0].url,
    'https://api.example.com/api/v3/auth/sign-in/username',
  )
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    username: 'owner',
    password: 'test-password',
    rememberMe: true,
  })
  assert.equal(
    calls[1].url,
    'https://api.example.com/api/v3/owner/check_logged',
  )
})
