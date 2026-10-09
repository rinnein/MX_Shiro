import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

import * as webhook from '@mx-space/webhook'
import ts from 'typescript'

const transpile = (path) =>
  ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
const events = { exports: {}, require: () => webhook }
vm.runInNewContext(transpile('../types/events.ts'), events)

const setup = () => {
  const handlers = new Map()
  const sent = []
  const messages = []
  const socket = {
    state: 'open',
    on: (name, callback) => {
      const list = handlers.get(name) || []
      list.push(callback)
      handlers.set(name, list)
    },
    send: (event, payload) => sent.push({ event, payload }),
  }
  let connectPort
  const self = {
    SharedWorkerGlobalScope: {},
    addEventListener: (_event, listener) => {
      connectPort = listener
    },
  }
  vm.runInNewContext(transpile('./io.worker.ts'), {
    self,
    SharedWorkerGlobalScope: {},
    exports: {},
    require: (name) =>
      name === '@mx-space/ws-client'
        ? { createWsClient: () => socket }
        : events.exports,
  })
  const port = () => {
    const p = { start() {}, postMessage: (data) => messages.push(data) }
    connectPort({ ports: [p] })
    return (data) => p.onmessage({ data })
  }
  return {
    port,
    sent,
    messages,
    emit: (name, value) => handlers.get(name)?.forEach((fn) => fn(value)),
  }
}

test('uses Core v14 event names, waits for greeting and restores deduplicated rooms on reconnect', () => {
  const { port, sent, emit } = setup()
  const first = port()
  const second = port()
  first({
    type: 'config',
    payload: { url: 'wss://example.com/ws/web', socket_session_id: 'visitor' },
  })
  const join = {
    type: 'emit',
    payload: {
      type: 'join',
      payload: { roomName: 'article-190106791734427656' },
    },
  }
  first(join)
  second(join)
  assert.equal(sent.length, 0)
  emit('gateway.connect', 'WebSocket connected')
  assert.deepEqual(structuredClone(sent), [
    { event: 'session.update', payload: { sessionId: 'visitor' } },
    { event: 'room.join', payload: { room: 'article-190106791734427656' } },
  ])
  const leave = { ...join, payload: { ...join.payload, type: 'leave' } }
  first(leave)
  assert.equal(sent.length, 2)
  emit('$state', 'reconnecting')
  emit('gateway.connect', 'WebSocket connected')
  assert.equal(sent.filter((item) => item.event === 'room.join').length, 2)
  second(leave)
  assert.equal(sent.at(-1).event, 'room.leave')
})

test('forwards business messages in the existing Shiro event format', () => {
  const { port, emit, messages } = setup()
  port()({
    type: 'config',
    payload: { url: 'wss://example.com/ws/web', socket_session_id: 'visitor' },
  })
  emit('comment.create', { id: '123', ref_id: '456' })
  assert.deepEqual(structuredClone(messages.at(-1)), {
    type: 'message',
    payload: { type: 'comment.create', data: { id: '123', ref_id: '456' } },
  })
})

test('visibility, comment updates and custom functions keep exact v14 names', () => {
  const { port, emit, messages } = setup()
  port()({
    type: 'config',
    payload: { url: 'wss://example.com/ws/web', socket_session_id: 'visitor' },
  })
  for (const event of [
    'post.unpublish',
    'post.republish',
    'note.unpublish',
    'note.republish',
    'comment.update',
    'page.delete',
    'fn.shiro#update',
  ]) {
    emit(event, { id: '190106791734427656' })
    assert.equal(messages.at(-1).payload.type, event)
  }
})

test('browser event constants match every event exported by webhook 1.0.0', () => {
  for (const [name, value] of Object.entries(webhook.BusinessEvents))
    assert.equal(events.exports.EventTypes[name], value)
})
