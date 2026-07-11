# Integrating notifykit

## Install

```bash
npm install @notifykit/core
npm install @notifykit/express          # optional list/unread/read endpoints
```

## Implement the seams

- `NotificationStore` — your in-app notifications table. It is written FIRST
  and is the source of truth: if this write fails, `notify` rejects and no
  channel fires.
- `TemplateRenderer` — your copy/i18n: `(event, channel) → message | null`
  (null skips that channel for that event type).
- Channel senders — structural adapters ship for firebase-admin messaging
  (with dead-token pruning), nodemailer, Twilio and Socket.IO; you pass YOUR
  configured clients.
- `PreferenceResolver` — optional per-user channel opt-outs; the preference
  data stays in your schema.

## Semantics you can rely on

Per-channel error isolation: a dead SMTP server never blocks the push; every
failure is collected in the result and surfaced via `onError`, never thrown.

## Pairing with sibling kits

Kits pair **by shape, never by import** — every integration point is a
parameter interface a sibling kit satisfies structurally. Pass the real kit,
your own service, or a stub in tests.

- `@reviewkit/core` and `@chatkit/core` take this Notifier as their
  `notifier` parameter as-is (review.received, chat.message_received, …) —
  your renderer maps those event types to copy.

## Migrating from an existing implementation

The kits were extracted from production systems, and these rules kept those
migrations safe:

1. **Never rewrite a working flow in one step.** Keep your endpoint URLs,
   response envelopes and (for realtime) socket event names byte-identical;
   swap the implementation underneath, one endpoint at a time.
2. **Data stays put.** The store seams map onto your existing tables — new
   capabilities need at most additive columns, never a data migration.
3. **Delete the superseded code in the same change.** Two implementations of
   the same behavior is how drift starts.
4. Where the kit enforces domain rules through policy hooks, your hooks may
   THROW your app's own error types — the kit re-throws them untouched, so
   your API's error contract survives the swap.
