# Integration guide

Same submodule mechanics as the other kits (clustermap-kit INTEGRATION.md has
the general flow). `git submodule add git@github.com:aymenmokhtarikouki/notifykit.git
vendor/notifykit` → `npm --prefix vendor/notifykit run setup` → `file:` deps
for `@notifykit/core` (+ `@notifykit/express`).

## yuma_backend (Prisma)

- `NotificationStore` → the existing notifications model
  (list/unread/read-all routes already match `@notifykit/express` — swap the
  controller internals, keep the URLs).
- Senders: wrap the existing transactionalMailer (`smtpEmailSender`) + Twilio
  (`twilioSmsSender`).
- **Push (new capability):** add `fcmTokens String[]` to User (or a
  DeviceToken model), register tokens from Flutter, implement
  `DeviceTokenStore` with pruning via `removeTokens`.
- **Realtime (new capability):** add socket.io, authenticate handshakes with
  authkit `verifyAccess`, join `user:<id>` rooms, plug `socketIoEmitter(io)`
  — this also gives live chat later (chat is polled today).
- Replace ad-hoc "create notification + maybe email" code paths with
  `notifier.notify(userId, { type, data })`.

## lineo-backend (pg)

- `NotificationStore` → notifications table (raw SQL like other stores).
- `fcmPushSender(admin.messaging(), { tokens })` — `tokensForUser` reads
  `users.fcm_tokens`, `removeTokens` does the array-remove UPDATE that
  `fcm.ts` hand-rolls today.
- `socketIoEmitter(io)` — the Socket.IO server already exists; keep queue
  events as-is, use notifykit for user-facing notifications.
- `resolvePreferences` → read `users.notification_preferences` JSONB and map
  event types to channels.

## Both apps

- Templates: one module per app, `Record<eventType, (event, channel) => RenderedMessage | null>`
  — this is where copy/i18n lives; the kit never renders text itself.
- Event types: adopt a `domain.action` convention (`order.accepted`,
  `queue.your_turn`, `payment.released`).
- Deploys/CI: `git submodule update --init` + `npm --prefix vendor/notifykit
  run setup` BEFORE the consumer `npm install`.
