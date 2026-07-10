/** In-memory NotificationStore — demos and tests only. */
import crypto from 'crypto'
import type { NotificationRecord, NotificationStore } from './types'

export function createInMemoryNotificationStore(): NotificationStore {
  const rows: NotificationRecord[] = []

  return {
    async create(userId, input) {
      const record: NotificationRecord = {
        id: crypto.randomUUID(),
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data ?? null,
        readAt: null,
        createdAt: new Date(),
      }
      rows.push(record)
      return record
    },
    async listByUser(userId, opts) {
      let list = rows.filter((r) => r.userId === userId)
      if (opts?.before) list = list.filter((r) => r.createdAt < opts.before!)
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      return list.slice(0, opts?.limit ?? 50)
    },
    async unreadCount(userId) {
      return rows.filter((r) => r.userId === userId && r.readAt === null).length
    },
    async markRead(userId, id) {
      const r = rows.find((x) => x.userId === userId && x.id === id)
      if (r && !r.readAt) r.readAt = new Date()
    },
    async markAllRead(userId) {
      const now = new Date()
      for (const r of rows) if (r.userId === userId && !r.readAt) r.readAt = now
    },
  }
}
