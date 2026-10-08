import assert from 'node:assert/strict'
import { test } from 'node:test'

import createClient, { allControllers } from '@mx-space/api-client'
import { $fetch } from 'ofetch'

import {
  createCoreFetchAdapter,
  normalizeCoreRequest,
  normalizeCoreResponse,
} from './core-compat.ts'
import { getCoreSocketUrl, normalizeCoreApiUrl } from './endpoint.ts'

const base = 'https://api.example.com/api/v3'
const id = '190106791734427656'
const created = '2026-10-08T00:00:00.000Z'
const wirePost = {
  id,
  title: 'Post',
  text: 'Body',
  created_at: created,
  modified_at: null,
  read_count: 12,
  like_count: 3,
  pin_at: created,
}
const makeClient = (body, calls = []) =>
  createClient(
    createCoreFetchAdapter(
      $fetch.create(
        {},
        {
          fetch: async (url, options) => {
            calls.push({ url: String(url), options })
            return new Response(
              JSON.stringify(typeof body === 'function' ? body(url) : body),
              { headers: { 'content-type': 'application/json' } },
            )
          },
        },
      ),
    ),
  )(base, {
    controllers: allControllers,
    getDataFromResponse: (response) => response,
  })

test('preserves post ids, dates, counters, interaction and pagination through the real SDK', async () => {
  const c = makeClient({
    data: [wirePost],
    meta: {
      pagination: { page: 2, size: 10, total: 25, total_pages: 3 },
      interaction: { [id]: { is_liked: true } },
    },
  })
  const result = (await c.post.getList(2)).$serialized
  assert.equal(result.data[0].id, id)
  assert.equal(result.data[0].created, created)
  assert.equal(result.data[0].modified, null)
  assert.equal(result.data[0].pin, created)
  assert.equal(result.data[0].isLiked, true)
  assert.deepEqual(result.data[0].count, { read: 12, like: 3 })
  assert.equal(result.pagination.currentPage, 2)
  assert.equal(result.pagination.totalPage, 3)
  assert.equal(result.pagination.hasNextPage, true)
})

test('keeps note navigation separate from the note model', async () => {
  const c = makeClient({
    data: {
      ...wirePost,
      nid: 10,
      is_published: true,
      next: { id: '190106791734427657', nid: 11 },
    },
  })
  const result = (await c.note.getLatest()).$serialized
  assert.equal(result.data.nid, 10)
  assert.equal(result.data.hide, false)
  assert.equal(result.data.allowComment, true)
  assert.equal(result.next.nid, 11)
  assert.equal(result.data.next, undefined)
})

test('wraps non-paginated arrays and preserves raw auth responses and null sessions', async () => {
  assert.deepEqual(
    (await makeClient({ data: ['github'] }).proxy.auth.providers.get())
      .$serialized,
    { data: ['github'] },
  )
  assert.equal(await makeClient({ data: null }).proxy.auth.session.get(), null)
  assert.equal(
    (
      await makeClient({ token: 'test-session' })
        .proxy.auth('sign-in')
        .username.post()
    ).token,
    'test-session',
  )
  assert.deepEqual(
    normalizeCoreResponse(`${base}/options/url`, {
      data: { web_url: 'https://example.com' },
    }),
    { data: { webUrl: 'https://example.com' } },
  )
})

test('converts comments with replies and reader identities without losing moderation receipts', () => {
  const result = normalizeCoreResponse(`${base}/comments/ref/${id}`, {
    data: [
      {
        id: '100',
        ref_id: id,
        text: 'root',
        created_at: created,
        reader: { id: '200', name: 'Reader' },
        reader_id: '200',
        replies: [
          {
            id: '101',
            ref_id: id,
            text: 'reply',
            parent_comment_id: '100',
            reader: { id: '201', name: 'Reply reader' },
          },
        ],
        reply_window: { has_hidden: true, next_cursor: 'cursor' },
      },
    ],
    meta: { pagination: { page: 1, total_pages: 1, total: 1, size: 10 } },
  })
  assert.equal(result.data[0].children[0].parent, '100')
  assert.equal(result.data[0].replyWindow.nextCursor, 'cursor')
  assert.equal(result.readers['201'].name, 'Reply reader')
  assert.equal(result.data[0].created, created)
  assert.equal(
    normalizeCoreResponse(`${base}/comments/thread/100`, {
      data: { replies: [], done: false, next_cursor: 'next' },
    }).nextCursor,
    'next',
  )
  assert.equal(
    normalizeCoreResponse(`${base}/comments/guest/${id}`, {
      data: {
        id: '102',
        text: '',
        moderation: { status: 'pending', receipt: 'receipt' },
      },
    }).moderation.status,
    'pending',
  )
})

test('does not treat theme configuration or article metadata as database models', () => {
  const result = normalizeCoreResponse(`${base}/posts/${id}`, {
    data: {
      ...wirePost,
      meta: { createdAt: 'custom' },
      theme: { createdAt: 'theme' },
    },
  })
  assert.deepEqual(result.meta, { createdAt: 'custom' })
  assert.deepEqual(result.theme, { createdAt: 'theme' })
})

test('reconstructs aggregate navigation using public pages and categories', async () => {
  const c = makeClient((url) =>
    String(url).includes('/pages')
      ? {
          data: [
            {
              id,
              title: 'About',
              slug: 'about',
              text: 'private body not needed',
            },
          ],
        }
      : String(url).includes('/categories')
        ? { data: [{ id: '300', name: 'Category' }] }
        : { data: { user: {}, seo: {}, url: {} } },
  )
  const result = await c.aggregate.getAggregateData('shiro')
  assert.equal(result.pageMeta[0].slug, 'about')
  assert.equal(result.pageMeta[0].text, undefined)
  assert.equal(result.categories[0].id, '300')
})

test('rewrites only legacy owner paths, sort fields, note visibility and post pin writes', () => {
  assert.equal(
    normalizeCoreRequest(`${base}/master/check_logged`, 'GET').url,
    `${base}/owner/check_logged`,
  )
  assert.equal(
    new URL(
      normalizeCoreRequest(`${base}/posts?sortBy=created`, 'GET').url,
    ).searchParams.get('sortBy'),
    'createdAt',
  )
  assert.deepEqual(
    normalizeCoreRequest(`${base}/posts/${id}`, 'PATCH', { pin: null }).data,
    { pinAt: null },
  )
  assert.deepEqual(
    normalizeCoreRequest(`${base}/notes/${id}`, 'PUT', {
      hide: true,
      text: 'note',
    }).data,
    { isPublished: false, text: 'note' },
  )
})

test('normalizes configured v2 API URLs and native WebSocket reverse-proxy prefixes', () => {
  assert.equal(
    normalizeCoreApiUrl('https://example.com/prefix/api/v2/'),
    'https://example.com/prefix/api/v3',
  )
  assert.equal(normalizeCoreApiUrl('/api/v3'), '/api/v3')
  assert.equal(
    getCoreSocketUrl('https://example.com/prefix/', 'http://localhost:2323'),
    'wss://example.com/prefix/ws/web',
  )
  assert.equal(
    getCoreSocketUrl('', 'http://localhost:2323'),
    'ws://localhost:2323/ws/web',
  )
})

test('never retries a failed write', async () => {
  let count = 0
  const adapter = createCoreFetchAdapter(
    $fetch.create(
      {},
      {
        fetch: async () => {
          count++
          return new Response('{}', { status: 503 })
        },
      },
    ),
  )
  await assert.rejects(
    adapter.post(`${base}/comments/guest/${id}`, { data: { text: 'once' } }),
  )
  assert.equal(count, 1)
})

test('does not rewrite content slugs that happen to be named user or master', () => {
  assert.equal(
    normalizeCoreRequest(`${base}/posts/user/master`, 'GET').url,
    `${base}/posts/user/master`,
  )
})
