import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'

import { invalidatesContent, readCoreWebhook } from './core-webhook.ts'

const secret = 'fixture-only'
const body = { id: '190106791692484609' }
const headers = (type) =>
  new Headers({
    'x-webhook-event': type,
    'x-webhook-signature': createHmac('sha1', secret)
      .update(JSON.stringify(body))
      .digest('hex'),
    'x-webhook-signature256': createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex'),
  })

test('v14 content and visibility events invalidate caches only after signature verification', () => {
  for (const type of [
    'post.create',
    'post.unpublish',
    'post.republish',
    'note.unpublish',
    'page.delete',
    'comment.update',
    'category.update',
    'content.refresh',
  ]) {
    assert.equal(readCoreWebhook(headers(type), body, secret).type, type)
    assert.equal(invalidatesContent(type), true)
  }
  assert.equal(invalidatesContent('POST_CREATE'), false)
  assert.equal(invalidatesContent('visitor.online'), false)
  assert.equal(
    readCoreWebhook(headers('health_check'), body, secret).type,
    'health_check',
  )
})

test('missing, malformed and tampered signatures reject without triggering invalidation', () => {
  assert.throws(() => readCoreWebhook(new Headers(), body, secret))
  const malformed = headers('post.create')
  malformed.set('x-webhook-signature', 'short')
  assert.throws(() => readCoreWebhook(malformed, body, secret))
  assert.throws(() =>
    readCoreWebhook(headers('post.create'), { ...body, changed: true }, secret),
  )
})
