# @notifykit/express

Express 4/5 handlers for the standard in-app notification endpoints: list, unread count, mark read, mark all read. Envelope- and auth-agnostic.

## Install

```bash
npm install @notifykit/express
```

Installs with it: `@notifykit/core` (automatic dependency).

## You provide

- Your Express router + auth middleware (reads `req.auth.userId` by default)
- The `NotificationStore` you built for the notifier

The package never owns tables, never imports an ORM, HTTP framework, or
provider SDK it can take as a parameter — storage and delivery are seams your
app implements on its own stack.

## Quick example

```ts
import { createNotificationHandlers } from '@notifykit/express'

const h = createNotificationHandlers(store, { wrapResponse })
router.get('/notifications', requireAuth, h.list)
```

## Pairs with

- `@authkit/express` middleware upstream

Kits pair **by shape, never by import** — pass the sibling kit, your own
service, or a stub in tests.

## Docs

Full contracts and integration guides live in the repo:
https://github.com/aymenmokhtarikouki/notifykit (`contracts/`, `docs/`).

## License

UNLICENSED — published for use by the author's applications.
