/**
 * notifykit demo — console channels stand in for FCM/SMTP/Twilio; the
 * `x-user` header stands in for auth middleware. Try:
 *
 *   curl -X POST :4840/demo/notify -H 'content-type: application/json' \
 *        -d '{"userId":"u1","type":"order.accepted","data":{"orderId":"o42"}}'
 *   curl :4840/notifications -H 'x-user: u1'
 *   curl :4840/notifications/unread -H 'x-user: u1'
 *   curl -X POST :4840/notifications/read-all -H 'x-user: u1'
 */
import express from 'express'
import {
  createNotifier,
  createInMemoryNotificationStore,
  consoleChannel,
  type TemplateRenderer,
} from '@notifykit/core'
import { createNotificationHandlers } from '@notifykit/express'

const store = createInMemoryNotificationStore()

// App-side templates: copy per event type, per channel.
const render: TemplateRenderer = (event, channel) => {
  switch (event.type) {
    case 'order.accepted': {
      const orderId = (event.data as { orderId?: string } | undefined)?.orderId ?? '?'
      if (channel === 'SMS') return null // this event never goes to SMS
      return { title: 'Order accepted 🎉', body: `Your order ${orderId} is being prepared.`, data: { orderId } }
    }
    default:
      return { title: event.type, body: JSON.stringify(event.data ?? {}) }
  }
}

const notifier = createNotifier({
  store,
  render,
  channels: {
    push: consoleChannel('push'),
    email: consoleChannel('email'),
    sms: consoleChannel('sms'),
    realtime: { emitToUser: (u, e, p) => console.log(`[notifykit/realtime] → ${u} ${e}`, JSON.stringify(p).slice(0, 120)) },
  },
})

const app = express()
app.use(express.json())

app.post('/demo/notify', async (req, res) => {
  const { userId, type, data } = req.body as { userId: string; type: string; data?: unknown }
  const results = await notifier.notify(userId, { type, data })
  res.json({ data: results })
})

const handlers = createNotificationHandlers(store, {
  wrapResponse: (data) => ({ data }),
  getUserId: (req) => (typeof req.headers['x-user'] === 'string' ? req.headers['x-user'] : undefined),
})
app.get('/notifications', handlers.list)
app.get('/notifications/unread', handlers.unreadCount)
app.post('/notifications/:id/read', handlers.markRead)
app.post('/notifications/read-all', handlers.markAllRead)

const PORT = Number(process.env.PORT ?? 4840)
app.listen(PORT, () => console.log(`notifykit demo → http://localhost:${PORT}`))
