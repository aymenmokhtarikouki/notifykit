import { describe, expect, it } from 'vitest'
import { createInMemoryNotificationStore } from '@notifykit/core'
import { createNotificationHandlers } from '../src/index'

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return payload
    },
  }
  return res
}

describe('notification handlers', () => {
  it('401 without a user id; list/unread/read-all round trip with envelope', async () => {
    const store = createInMemoryNotificationStore()
    await store.create('u1', { type: 'order.accepted', title: 'A', body: 'x' })
    await store.create('u1', { type: 'chat.message', title: 'B', body: 'y' })
    const h = createNotificationHandlers(store, { wrapResponse: (d) => ({ data: d }) })

    const anon = mockRes()
    await h.list({ headers: {} }, anon)
    expect(anon.statusCode).toBe(401)

    const auth = { headers: {}, auth: { userId: 'u1' } }
    const list = mockRes()
    await h.list({ ...auth, query: { limit: '10' } }, list)
    expect((list.body as { data: unknown[] }).data).toHaveLength(2)

    const unread = mockRes()
    await h.unreadCount(auth, unread)
    expect((unread.body as { data: { count: number } }).data.count).toBe(2)

    await h.markAllRead(auth, mockRes())
    const after = mockRes()
    await h.unreadCount(auth, after)
    expect((after.body as { data: { count: number } }).data.count).toBe(0)
  })

  it('markRead is per-user scoped and idempotent', async () => {
    const store = createInMemoryNotificationStore()
    const rec = await store.create('u1', { type: 't', title: 'A', body: '' })
    const h = createNotificationHandlers(store)

    // Another user cannot read-mark someone else's notification.
    await h.markRead({ headers: {}, auth: { userId: 'intruder' }, params: { id: rec.id } }, mockRes())
    expect(await store.unreadCount('u1')).toBe(1)

    await h.markRead({ headers: {}, auth: { userId: 'u1' }, params: { id: rec.id } }, mockRes())
    await h.markRead({ headers: {}, auth: { userId: 'u1' }, params: { id: rec.id } }, mockRes())
    expect(await store.unreadCount('u1')).toBe(0)
  })

  it('custom getUserId supports non-authkit apps', async () => {
    const store = createInMemoryNotificationStore()
    await store.create('u9', { type: 't', title: 'A', body: '' })
    const h = createNotificationHandlers(store, {
      getUserId: (req) => (typeof req.headers['x-user'] === 'string' ? req.headers['x-user'] : undefined),
    })

    const res = mockRes()
    await h.unreadCount({ headers: { 'x-user': 'u9' } }, res)
    expect((res.body as { count: number }).count).toBe(1)
  })
})
