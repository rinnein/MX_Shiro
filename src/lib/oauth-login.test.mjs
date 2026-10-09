import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createAuthClient } from 'better-auth/client'

import {
  createSocialSignIn,
  getOAuthErrorMessage,
  getOAuthReturnUrl,
  getSocialSignInOptions,
} from './oauth-login.ts'

test('sends success, new-user and error callbacks on the frontend origin through Better Auth', async () => {
  const requests = []
  const client = createAuthClient({
    baseURL: 'https://api.example.com/api/v3/auth',
    fetchOptions: {
      credentials: 'include',
      retry: 0,
      customFetchImpl: async (url, options) => {
        requests.push({ url: String(url), options })
        return new Response(
          JSON.stringify({
            url: 'https://github.com/login/oauth/authorize',
            redirect: true,
          }),
          { headers: { 'content-type': 'application/json' } },
        )
      },
    },
  })
  const signIn = createSocialSignIn((options) => client.signIn.social(options))
  const current = 'https://blog.example.com/posts/demo?view=full#comments'
  await signIn(getSocialSignInOptions('github', current))
  assert.equal(
    requests[0].url,
    'https://api.example.com/api/v3/auth/sign-in/social',
  )
  assert.equal(requests[0].options.credentials, 'include')
  const body = JSON.parse(requests[0].options.body)
  assert.equal(body.callbackURL, current)
  assert.equal(body.newUserCallbackURL, current)
  const failed = new URL(body.errorCallbackURL)
  assert.equal(failed.origin, 'https://blog.example.com')
  assert.equal(failed.pathname, '/auth/error')
  assert.equal(
    failed.searchParams.get('returnTo'),
    '/posts/demo?view=full#comments',
  )
})

test('retries from the failure page to the original page, without keeping the old error', () => {
  const failed = getSocialSignInOptions(
    'github',
    'https://blog.example.com/posts/demo#comments',
  ).errorCallbackURL
  const next = getSocialSignInOptions('github', `${failed}&error=invalid_code`)
  assert.equal(next.callbackURL, 'https://blog.example.com/posts/demo#comments')
  assert.equal(new URL(next.errorCallbackURL).searchParams.has('error'), false)
})

test('invalid or external return destinations fall back to the frontend homepage', () => {
  for (const target of [
    'https://other.example/',
    '//other.example/',
    'javascript:alert(1)',
    'http://[',
    '/auth/error/',
    'https://user:pass@blog.example.com/',
  ]) {
    const url = `https://blog.example.com/auth/error?returnTo=${encodeURIComponent(target)}`
    assert.equal(getOAuthReturnUrl(url).href, 'https://blog.example.com/')
  }
})

test('shares an in-flight authorization request, and allows retry after API errors', async () => {
  let calls = 0
  let finish
  const signIn = createSocialSignIn(() => {
    calls++
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const first = signIn({ provider: 'github' })
  assert.equal(signIn({ provider: 'github' }), first)
  assert.equal(calls, 1)
  finish({ error: { message: 'Provider unavailable' } })
  await assert.rejects(first, /Provider unavailable/)
  const retry = signIn({ provider: 'github' })
  assert.equal(calls, 2)
  finish({ error: null })
  await retry
})

test('network failure releases the authorization guard', async () => {
  let calls = 0
  const signIn = createSocialSignIn(async () => {
    calls++
    if (calls === 1) throw new Error('offline')
    return { error: null }
  })
  await assert.rejects(signIn({}), /offline/)
  await signIn({})
  assert.equal(calls, 2)
})

test('describes invalid_code without claiming a particular backend cause', () => {
  assert.match(getOAuthErrorMessage('invalid_code'), /授权码验证失败/)
  assert.match(getOAuthErrorMessage('access_denied'), /取消了授权/)
  assert.equal(
    getOAuthErrorMessage('<untrusted error>'),
    '暂时无法完成登录，请重新尝试。',
  )
})
