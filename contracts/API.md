# notifykit — HTTP + socket contract

Payloads may be wrapped in the app envelope (commonly `{ "data": … }`).

## In-app endpoints (authed)

- `GET /notifications?limit=&before=` → `NotificationRecord[]` (newest first, limit ≤ 100)
- `GET /notifications/unread` → `{ count }` (the bell badge)
- `POST /notifications/:id/read` → `{ ok: true }` (idempotent, per-user scoped)
- `POST /notifications/read-all` → `{ ok: true }`

```jsonc
// NotificationRecord
{
  "id": "…", "userId": "…",
  "type": "order.accepted",          // event type — client routes deep links on it
  "title": "Order accepted 🎉",
  "body": "Your order o42 is being prepared.",
  "data": { "orderId": "o42" } | null,
  "readAt": "…" | null,
  "createdAt": "…"
}
```

`401 { error: { code: "UNAUTHENTICATED" } }` without a user.

## Realtime (Socket.IO)

- Server emits to room `user:<userId>` (join it after authenticating the
  socket — verify the authkit access token in the handshake).
- Event name: `notification` (configurable). Payload:

```jsonc
{
  "type": "order.accepted",
  "record": { /* NotificationRecord */ } | null,  // prepend + bump badge
  "message": { "title", "body", "data" } | null    // only for record-less events
}
```

## Push (FCM)

`notification: { title, body }` + `data` with all values stringified
(non-strings are JSON-encoded). Clients deep-link from `data.type` etc.

## Client rules

1. Badge = `/notifications/unread` count; refresh on socket `notification`.
2. Socket payload with `record` → prepend to the list, increment badge.
3. Mark-read on open; `read-all` from the bell menu.
