# @notifykit/core

One notify(userIds, event) fan-out: in-app record written FIRST (source of truth for the bell/unread badge), then push/email/SMS/realtime with per-channel error isolation. Templates and preferences stay app-side via seams.

## Install

```bash
npm install @notifykit/core
```

Installs with it: nothing else — zero dependencies.

## You provide

- `NotificationStore` — your in-app notifications table
- `TemplateRenderer` — your copy/i18n: (event, channel) → message or null to skip
- Channel senders — structural adapters included for YOUR firebase-admin messaging, nodemailer transporter, Twilio client, Socket.IO server
- Optional `PreferenceResolver` — your per-user channel opt-outs

The package never owns tables, never imports an ORM, HTTP framework, or
provider SDK it can take as a parameter — storage and delivery are seams your
app implements on its own stack.

## Quick example

```ts
import { createNotifier, fcmPushSender, socketIoEmitter } from '@notifykit/core'

const notifier = createNotifier({ store, render,
  channels: { push: fcmPushSender(messaging, tokenStore), realtime: socketIoEmitter(io) } })
await notifier.notify(userId, { type: 'order.accepted', data: { orderId } })
```

## Pairs with

- `@reviewkit/core` and `@chatkit/core` accept this Notifier as their `notifier` parameter as-is

Kits pair **by shape, never by import** — pass the sibling kit, your own
service, or a stub in tests.

## Docs

Full contracts and integration guides live in the repo:
https://github.com/aymenmokhtarikouki/notifykit (`contracts/`, `docs/`).

## License

MIT
