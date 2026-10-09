import assert from 'node:assert/strict'
import { test } from 'node:test'

import { $fetch } from 'ofetch'

import { createV3Client } from '../../packages/fetch/src/v3.ts'
import {
  editorFromPublication,
  getPublicationBase,
  publishArticle,
  snapshotFromEditor,
} from './content-publish.ts'

const articleId = '190106791692484609'
const branchId = '190106791692484610'
const revisionId = '190106791692484611'
const oldRevisionId = '190106791692484608'
const taskId = 'publish-task'
const snapshot = {
  title: 'Title',
  text: 'Body',
  contentFormat: 'markdown',
  images: [],
  meta: {},
  typeSpecificData: {
    slug: 'test',
    categoryId: '190106791692484600',
    pin: true,
    isPremium: true,
  },
}
const article = {
  ...snapshot,
  id: articleId,
  slug: 'test',
  pin: '2026-10-09',
  publicationBase: { revisionId: oldRevisionId, snapshot },
}
const branch = {
  id: branchId,
  headRevisionId: revisionId,
  relationToPublished: 'ancestor',
  document: { publishedRevisionId: oldRevisionId, refId: articleId },
  headRevision: snapshot,
}
const completed = {
  id: taskId,
  status: 'completed',
  payload: { branchId, revisionId },
  result: {
    articleCommitted: true,
    articleId,
    publishedRevisionId: revisionId,
  },
}
const makeClient = (reply) => {
  const calls = []
  const fetcher = $fetch.create(
    {},
    {
      fetch: async (url, options) => {
        const call = {
          path: new URL(url).pathname.replace('/api/v3', ''),
          method: options.method,
          query: new URL(url).searchParams,
          body: options.body ? JSON.parse(options.body) : undefined,
        }
        calls.push(call)
        const body = await reply(call, calls)
        if (body instanceof Response) return body
        return new Response(JSON.stringify({ data: body }), {
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  )
  return {
    client: createV3Client(fetcher, 'https://api.example.com/api/v3'),
    calls,
  }
}
const store = () => {
  let state
  return {
    get state() {
      return state
    },
    saveState(next) {
      state = next
    },
    wait: async () => {},
    attempts: 2,
  }
}
const normalReply = (call) =>
  call.path === '/drafts'
    ? branch
    : call.path === '/publish-jobs'
      ? { task_id: taskId, created: true }
      : completed

test('publishes a frozen revision and only returns success after the task commits it', async () => {
  let polls = 0
  const { client, calls } = makeClient((call) =>
    call.path.startsWith('/tasks/') && polls++ === 0
      ? { ...completed, status: 'running', result: null }
      : normalReply(call),
  )
  const options = store()
  const result = await publishArticle(client, 'post', article, options)
  assert.equal(result.id, articleId)
  assert.equal(result.publicationBase.revisionId, revisionId)
  assert.equal(options.state, undefined)
  assert.equal(calls[0].body.baseRevisionId, oldRevisionId)
  assert.equal(calls[0].body.data.typeSpecificData.isPremium, true)
  assert.deepEqual(calls[1].body, {
    branchId,
    revisionId,
    expectedPublishedRevisionId: oldRevisionId,
    confirmDiverged: false,
    aiResources: [],
  })
  assert.deepEqual(
    calls.map(({ path }) => path),
    ['/drafts', '/publish-jobs', `/tasks/${taskId}`, `/tasks/${taskId}`],
  )
})

test('first publication uses a null publication precondition and the resulting article id', async () => {
  const { client, calls } = makeClient((call) =>
    call.path === '/drafts'
      ? {
          ...branch,
          relationToPublished: null,
          document: { publishedRevisionId: null, refId: null },
        }
      : normalReply(call),
  )
  const result = await publishArticle(
    client,
    'post',
    { ...article, id: '', publicationBase: undefined },
    store(),
  )
  assert.equal(result.id, articleId)
  assert.equal(calls[0].body.refId, undefined)
  assert.equal(calls[1].body.expectedPublishedRevisionId, null)
})

test('a concurrent publication never gets overwritten or confirmed as diverged', async () => {
  const { client, calls } = makeClient(() => ({
    ...branch,
    document: { ...branch.document, publishedRevisionId: '190106791692484699' },
  }))
  const options = store()
  await assert.rejects(
    publishArticle(client, 'post', article, options),
    /其他修订/,
  )
  assert.equal(calls.length, 1)
  assert.equal(options.state.branchId, branchId)
})

test('restored legacy edits without a revision base fail before writing', async () => {
  const { client, calls } = makeClient(normalReply)
  await assert.rejects(
    publishArticle(
      client,
      'post',
      { ...article, publicationBase: undefined },
      store(),
    ),
    /修订基准/,
  )
  assert.equal(calls.length, 0)
})

test('hidden notes are saved as drafts and subsequent saves compare the known branch head', async () => {
  const { client, calls } = makeClient(() => ({
    ...branch,
    document: { publishedRevisionId: null, refId: null },
  }))
  const options = store()
  const note = {
    title: 'Private',
    text: 'Secret',
    hide: true,
    password: 'test-password',
  }
  const result = await publishArticle(client, 'note', note, options)
  assert.equal(result.published, false)
  assert.equal(options.state.snapshotKey.includes('test-password'), false)
  await publishArticle(client, 'note', { ...note, text: 'Changed' }, options)
  assert.deepEqual(
    calls.map(({ method }) => method),
    ['POST', 'PUT'],
  )
  assert.equal(calls[1].body.expectedHeadRevisionId, revisionId)
  assert.equal(
    calls.some(({ path }) => path === '/publish-jobs'),
    false,
  )
})

test('pending tasks survive timeout and a retry polls instead of submitting again', async () => {
  let pending = true
  const { client, calls } = makeClient((call) =>
    call.path.startsWith('/tasks/') && pending
      ? { ...completed, status: 'running', result: null }
      : normalReply(call),
  )
  const options = store()
  await assert.rejects(
    publishArticle(client, 'post', article, options),
    /仍在处理中/,
  )
  assert.equal(options.state.taskId, taskId)
  pending = false
  assert.equal(
    (await publishArticle(client, 'post', article, options)).published,
    true,
  )
  assert.equal(calls.filter(({ path }) => path === '/publish-jobs').length, 1)
})

test('lost publish responses recover the existing task without sending another publication', async () => {
  const { client, calls } = makeClient((call) => {
    if (call.path === '/publish-jobs') throw new Error('Network lost')
    if (call.path === '/tasks') return [completed]
    return normalReply(call)
  })
  const options = store()
  await assert.rejects(publishArticle(client, 'post', article, options))
  assert.equal(options.state.submitting, true)
  const result = await publishArticle(client, 'post', article, options)
  assert.equal(result.id, articleId)
  assert.equal(calls.filter(({ path }) => path === '/publish-jobs').length, 1)
})

test('a failed task preserves the draft and does not signal success', async () => {
  const { client } = makeClient((call) =>
    call.path.startsWith('/tasks/')
      ? {
          ...completed,
          status: 'failed',
          result: null,
          error: 'Publish failed',
        }
      : normalReply(call),
  )
  const options = store()
  await assert.rejects(
    publishArticle(client, 'post', article, options),
    /Publish failed/,
  )
  assert.equal(options.state.branchId, branchId)
  assert.equal(options.state.taskId, undefined)
})

test('pending publication cannot be replaced with a changed snapshot', async () => {
  const { client, calls } = makeClient((call) =>
    call.path.startsWith('/tasks/')
      ? { ...completed, status: 'running', result: null }
      : normalReply(call),
  )
  const options = store()
  await assert.rejects(publishArticle(client, 'post', article, options))
  const count = calls.length
  await assert.rejects(
    publishArticle(
      client,
      'post',
      { ...article, text: 'Newer content' },
      options,
    ),
    /当前内容已变化/,
  )
  assert.equal(calls.length, count)
})

test('the editor starts from published revision content, preserves protection and rejects lexical writes', async () => {
  const { client } = makeClient(() => ({
    published_revision: { ...snapshot, id: oldRevisionId },
  }))
  const base = await getPublicationBase(client, 'post', articleId)
  const editable = editorFromPublication(
    { ...article, title: 'Old public cache', text: 'stale' },
    base,
  )
  assert.equal(editable.text, snapshot.text)
  const protectedNote = { ...article, hasPassword: true, password: undefined }
  assert.equal(
    Object.hasOwn(
      snapshotFromEditor('note', protectedNote).typeSpecificData,
      'password',
    ),
    false,
  )
  assert.equal(
    snapshotFromEditor('note', { ...protectedNote, password: '' })
      .typeSpecificData.password,
    null,
  )
  assert.throws(
    () => snapshotFromEditor('post', { ...article, contentFormat: 'lexical' }),
    /富文本/,
  )
})
