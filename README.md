# notifykit

Shared notification toolkit — **one `notify()` call, every channel**: in-app
records (bell/unread/read-all), FCM push, email, SMS and Socket.IO realtime.
The kit owns the fan-out behavior; your app owns storage, templates/copy,
the event catalog and preference data. Storage/delivery are seams — same
pattern as clustermap-kit / auth-kit / location-kit.

Consume as a **git submodule** at `vendor/notifykit` with `file:` deps.

## Why it exists

One production app had FCM + Socket.IO + Twilio + nodemailer + a preferences JSONB; another
had in-app notifications (list/unread/read-all) + SMTP + Twilio but **no push
and polled chat**. Same channels, half-overlapping code — and every future app
starts from zero. This kit puts one dispatcher in front of all of it.

## Packages

| Package | What | Deps |
| --- | --- | --- |
| `@notifykit/core` | `createNotifier` dispatcher: in-app record written FIRST (source of truth), then push/email/SMS/realtime fan-out with per-channel **error isolation** (a dead SMTP never blocks the push). Seams: `NotificationStore`, `PreferenceResolver`, `TemplateRenderer` (return `null` to skip a channel per event type), channel senders. Ships structural adapters: `fcmPushSender` (with dead-token pruning), `smtpEmailSender`, `twilioSmsSender`, `socketIoEmitter` — each takes YOUR configured client. | — |
| `@notifykit/express` | The endpoints every app exposes: list / unread count / mark read / mark all read. Express 4/5 structural typing, envelope-agnostic, auth-agnostic (`req.auth.userId` by default — authkit-compatible — or a custom `getUserId`). | core |

## Quick start

```ts
const notifier = createNotifier({
  store: myNotificationStore,                    // your notifications table
  render: (event, channel) => templates[event.type]?.(event, channel) ?? null,
  channels: {
    push: fcmPushSender(admin.messaging(), { tokens: myDeviceTokenStore }),
    email: smtpEmailSender(transporter, { from, emailForUser }),
    sms: twilioSmsSender(twilioClient, { from, phoneForUser }),
    realtime: socketIoEmitter(io),               // rooms: user:<id>
  },
  resolvePreferences: (userId, type) => prefsFor(userId, type), // optional
})

// anywhere in the app:
await notifier.notify(order.customerId, { type: 'order.accepted', data: { orderId } })
```

```ts
const h = createNotificationHandlers(store, { wrapResponse: createApiResponse })
router.get('/notifications', requireAuth, h.list)
router.get('/notifications/unread', requireAuth, h.unreadCount)
router.post('/notifications/:id/read', requireAuth, h.markRead)
router.post('/notifications/read-all', requireAuth, h.markAllRead)
```

## Demo

```bash
npm install && npm run demo   # :4840 — console channels, x-user header as auth
```

## Docs

[`contracts/API.md`](contracts/API.md) (endpoint + socket payload shapes for
Flutter/web) · [`docs/INTEGRATION.md`](docs/INTEGRATION.md) (submodule setup,
store recipes, FCM token store, socket auth via authkit).

## Deliberately out of v1

Queues/retries (both apps are single-node; a queue can wrap `notify()` later
without changing callers) · digests/batching · template engines (copy is app
domain) · preference storage (only the resolver seam).
