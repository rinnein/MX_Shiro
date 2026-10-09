import type { WsClient } from '@mx-space/ws-client'
import { createWsClient } from '@mx-space/ws-client'

import { EventTypes, SocketEmitEnum } from '~/types/events'

/// <reference lib="webworker" />

let ws: WsClient | null = null
let config: { url: string; socket_session_id: string } | null = null
let ready = false
const roomMembers = new Map<MessagePort | Window, Set<string>>()
const ports: MessagePort[] = []

const hasRoomMember = (room: string) =>
  [...roomMembers.values()].some((rooms) => rooms.has(room))

const broadcast = (message: unknown) => {
  for (const port of ports) port.postMessage(message)
}

function setupIo(nextConfig: NonNullable<typeof config>) {
  if (ws) return
  config = nextConfig
  ws = createWsClient({
    url: config.url,
    query: { socket_session_id: config.socket_session_id },
    backoff: { baseMs: 3000, maxMs: 30000 },
  })
  ws.on('$state', (state) => {
    if (state !== 'open') {
      ready = false
      broadcast({ type: 'disconnect' })
    }
  })
  // Wait for Core's greeting: the HTTP upgrade completes before async session
  // initialization, so joining rooms on the raw `open` event races the server.
  ws.on('gateway.connect', () => {
    ready = true
    ws?.send('session.update', { sessionId: config!.socket_session_id })
    for (const room of new Set(
      [...roomMembers.values()].flatMap((rooms) => [...rooms]),
    )) {
      ws?.send('room.join', { room })
    }
    broadcast({ type: 'connect' })
  })
  for (const event of [
    ...Object.values(EventTypes),
    'fn.media-update',
    'fn.ps-update',
    'fn.shiro#update',
  ]) {
    ws.on(event, (data) =>
      broadcast({ type: 'message', payload: { type: event, data } }),
    )
  }
}

function preparePort(port: MessagePort | Window) {
  port.onmessage = (event) => {
    const { type, payload } = event.data
    switch (type) {
      case 'config': {
        setupIo(payload)
        break
      }
      case 'emit': {
        const room = payload?.payload?.roomName
        if (
          (payload?.type === SocketEmitEnum.Join ||
            payload?.type === SocketEmitEnum.Leave) &&
          typeof room === 'string'
        ) {
          const wasJoined = hasRoomMember(room)
          const rooms = roomMembers.get(port) || new Set<string>()
          if (payload.type === SocketEmitEnum.Join) rooms.add(room)
          else rooms.delete(room)
          if (rooms.size > 0) roomMembers.set(port, rooms)
          else roomMembers.delete(port)
          const isJoined = hasRoomMember(room)
          if (ready && wasJoined !== isJoined)
            ws?.send(isJoined ? 'room.join' : 'room.leave', { room })
        } else if (payload?.type === SocketEmitEnum.UpdateSid && config) {
          config.socket_session_id = payload.payload.sessionId
          if (ready)
            ws?.send('session.update', { sessionId: config.socket_session_id })
        }
        break
      }
      case 'reconnect': {
        // The SDK owns reconnect/backoff and restores rooms after the greeting.
        if (ws?.state === 'closed' && config) {
          ws = null
          setupIo(config)
        }
        break
      }
      case 'init': {
        port.postMessage({ type: 'ping' })
        if (ready) port.postMessage({ type: 'connect' })
        break
      }
    }
  }
}

self.addEventListener('connect', (event: any) => {
  const port = (event as MessageEvent).ports[0]
  ports.push(port)
  preparePort(port)
  port.start()
})

if (!('SharedWorkerGlobalScope' in self)) {
  ports.push(self as unknown as MessagePort)
  preparePort(self)
}
