import { describe, expect, it, vi } from 'vitest'
import { createNotifier } from '../src/notifier'
import type { NotificationStore, RenderedMessage } from '../src/types'

const render = async (): Promise<RenderedMessage> => ({ title: 't', body: 'b' })

describe('notifier edge contracts', () => {
  it('an IN_APP store failure is FATAL — notify rejects (source of truth)', async () => {
    const store = {
      create: vi.fn(async () => {
        throw new Error('db down')
      }),
    } as unknown as NotificationStore
    const push = { send: vi.fn(async () => undefined) }
    const notifier = createNotifier({ store, render, channels: { push } })

    await expect(notifier.notify('u1', { type: 'x' })).rejects.toThrow('db down')
    // and nothing was pushed — the record is the prerequisite
    expect(push.send).not.toHaveBeenCalled()
  })

  it('renderer returning null for IN_APP skips the record but still pushes', async () => {
    const create = vi.fn()
    const store = { create } as unknown as NotificationStore
    const push = { send: vi.fn(async () => undefined) }
    const notifier = createNotifier({
      store,
      render: async (_event, channel) => (channel === 'IN_APP' ? null : { title: 't', body: 'b' }),
      channels: { push },
    })
    const [result] = await notifier.notify('u1', { type: 'x' })
    expect(create).not.toHaveBeenCalled()
    expect(push.send).toHaveBeenCalledOnce()
    expect(result!.delivered).toContain('PUSH')
    expect(result!.delivered).not.toContain('IN_APP')
  })

  it('multiple users each get their own record and result', async () => {
    const rows: string[] = []
    const store = {
      create: vi.fn(async (userId: string) => {
        rows.push(userId)
        return { id: `n_${rows.length}`, userId, type: 'x', title: 't', body: 'b', data: null, readAt: null, createdAt: new Date() }
      }),
    } as unknown as NotificationStore
    const notifier = createNotifier({ store, render })
    const results = await notifier.notify(['u1', 'u2', 'u3'], { type: 'x' })
    expect(rows).toEqual(['u1', 'u2', 'u3'])
    expect(results).toHaveLength(3)
  })
})
