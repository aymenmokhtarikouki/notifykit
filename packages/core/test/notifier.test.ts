import { describe, expect, it, vi } from 'vitest'
import {
  createNotifier,
  createInMemoryNotificationStore,
  fcmPushSender,
  socketIoEmitter,
  type ChannelSender,
  type NotifyEvent,
  type RenderedMessage,
  type TemplateRenderer,
} from '../src/index'

const render: TemplateRenderer = (event) => ({
  title: `T:${event.type}`,
  body: `B:${event.type}`,
  data: { type: event.type },
})

function fakeSender() {
  const sent: Array<{ userId: string; message: RenderedMessage }> = []
  const sender: ChannelSender = {
    async send(userId, message) {
      sent.push({ userId, message })
    },
  }
  return { sender, sent }
}

const EVENT: NotifyEvent = { type: 'order.accepted', data: { orderId: 'o1' } }

describe('dispatcher', () => {
  it('writes the in-app record FIRST and fans out to all configured channels', async () => {
    const store = createInMemoryNotificationStore()
    const push = fakeSender()
    const email = fakeSender()
    const emitted: unknown[] = []

    const notifier = createNotifier({
      store,
      render,
      channels: {
        push: push.sender,
        email: email.sender,
        realtime: { emitToUser: (_u, _e, payload) => void emitted.push(payload) },
      },
    })

    const [result] = await notifier.notify('u1', EVENT)

    expect(result!.record!.title).toBe('T:order.accepted')
    expect(result!.delivered).toEqual(['IN_APP', 'PUSH', 'EMAIL', 'REALTIME'])
    expect(result!.failed).toEqual([])
    expect(await store.unreadCount('u1')).toBe(1)
    expect(push.sent[0]!.userId).toBe('u1')
    // Realtime payload carries the stored record.
    expect((emitted[0] as { record: { id: string } }).record.id).toBe(result!.record!.id)
  })

  it('isolates channel failures — one dead sender never blocks the others', async () => {
    const store = createInMemoryNotificationStore()
    const push = fakeSender()
    const onError = vi.fn()

    const notifier = createNotifier({
      store,
      render,
      channels: {
        email: { send: async () => { throw new Error('SMTP down') } },
        push: push.sender,
      },
      onError,
    })

    const [result] = await notifier.notify('u1', EVENT)

    expect(result!.delivered).toContain('PUSH')
    expect(result!.delivered).toContain('IN_APP')
    expect(result!.failed).toHaveLength(1)
    expect(result!.failed[0]!.channel).toBe('EMAIL')
    expect(onError).toHaveBeenCalledOnce()
    expect(push.sent).toHaveLength(1) // push still went out
  })

  it('preference resolver filters channels per user', async () => {
    const store = createInMemoryNotificationStore()
    const push = fakeSender()
    const sms = fakeSender()

    const notifier = createNotifier({
      store,
      render,
      channels: { push: push.sender, sms: sms.sender },
      resolvePreferences: (userId) => (userId === 'quiet' ? ['IN_APP'] : ['IN_APP', 'PUSH', 'SMS']),
    })

    const results = await notifier.notify(['quiet', 'loud'], EVENT)

    expect(results[0]!.delivered).toEqual(['IN_APP'])
    expect(results[1]!.delivered).toEqual(['IN_APP', 'PUSH', 'SMS'])
    expect(push.sent.map((s) => s.userId)).toEqual(['loud'])
  })

  it('renderer returning null skips that channel (event-level opt-out)', async () => {
    const store = createInMemoryNotificationStore()
    const push = fakeSender()
    const notifier = createNotifier({
      store,
      render: (event, channel) => (channel === 'PUSH' ? null : render(event, channel)),
      channels: { push: push.sender },
    })

    const [result] = await notifier.notify('u1', EVENT)
    expect(result!.delivered).toEqual(['IN_APP'])
    expect(push.sent).toHaveLength(0)
    expect(result!.failed).toHaveLength(0) // a skip is not a failure
  })
})

describe('store — unread/read lifecycle', () => {
  it('counts unread, marks one and all read', async () => {
    const store = createInMemoryNotificationStore()
    const a = await store.create('u1', { type: 't', title: 'a', body: '' })
    await store.create('u1', { type: 't', title: 'b', body: '' })
    await store.create('u2', { type: 't', title: 'other user', body: '' })

    expect(await store.unreadCount('u1')).toBe(2)
    await store.markRead('u1', a.id)
    expect(await store.unreadCount('u1')).toBe(1)
    await store.markAllRead('u1')
    expect(await store.unreadCount('u1')).toBe(0)
    expect(await store.unreadCount('u2')).toBe(1) // untouched

    const list = await store.listByUser('u1')
    expect(list).toHaveLength(2)
  })
})

describe('fcmPushSender', () => {
  it('sends to all device tokens and prunes the dead ones', async () => {
    const removeTokens = vi.fn(async () => {})
    const sent: unknown[] = []
    const messaging = {
      sendEachForMulticast: async (msg: { tokens: string[] }) => {
        sent.push(msg)
        return {
          responses: msg.tokens.map((t) => t === 'dead-token'
            ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
            : { success: true }),
        }
      },
    }

    const sender = fcmPushSender(messaging, {
      tokens: { tokensForUser: async () => ['live-token', 'dead-token'], removeTokens },
    })
    await sender.send('u1', { title: 'Hi', body: 'There', data: { orderId: 'o1', n: 2 } }, EVENT)

    const msg = sent[0] as { tokens: string[]; data: Record<string, string> }
    expect(msg.tokens).toHaveLength(2)
    expect(msg.data).toEqual({ orderId: 'o1', n: '2' }) // FCM data stringified
    expect(removeTokens).toHaveBeenCalledWith('u1', ['dead-token'])
  })

  it('no devices → silent no-op', async () => {
    const messaging = { sendEachForMulticast: vi.fn() }
    const sender = fcmPushSender(messaging, { tokens: { tokensForUser: async () => [] } })
    await sender.send('u1', { title: 't', body: 'b' }, EVENT)
    expect(messaging.sendEachForMulticast).not.toHaveBeenCalled()
  })
})

describe('socketIoEmitter', () => {
  it('emits to the per-user room', () => {
    const emits: Array<{ room: string; event: string; payload: unknown }> = []
    const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => void emits.push({ room, event, payload }) }) }

    const emitter = socketIoEmitter(io)
    emitter.emitToUser('u42', 'notification', { hello: 1 })
    expect(emits[0]).toMatchObject({ room: 'user:u42', event: 'notification' })
  })
})
