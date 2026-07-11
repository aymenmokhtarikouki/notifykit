/**
 * @notifykit/express — the standard in-app notification endpoints
 * (list, unread, read, read-all). Structural req/res
 * typing (Express 4 + 5), envelope-agnostic, auth-agnostic: by default the
 * user id comes from `req.auth.userId` (authkit middleware), override with
 * `getUserId` for any other auth setup.
 *
 *   const h = createNotificationHandlers(store, { wrapResponse: createApiResponse })
 *   router.get('/notifications', requireAuth, h.list)
 *   router.get('/notifications/unread', requireAuth, h.unreadCount)
 *   router.post('/notifications/:id/read', requireAuth, h.markRead)
 *   router.post('/notifications/read-all', requireAuth, h.markAllRead)
 */
import type { NotificationStore } from '@notifykit/core'

export interface MinimalRequest {
  headers: Record<string, unknown>
  query?: Record<string, unknown>
  params?: Record<string, unknown>
  auth?: { userId: string }
}
export interface MinimalResponse {
  status(code: number): MinimalResponse
  json(body: unknown): unknown
}
export type NextFn = (err?: unknown) => void
type Handler = (req: MinimalRequest, res: MinimalResponse, next?: NextFn) => Promise<void>

export interface NotificationHandlersOptions {
  /** Wrap successful payloads in your app's envelope. */
  wrapResponse?: (data: unknown) => unknown
  /** Where the authenticated user id lives. Default: req.auth?.userId. */
  getUserId?: (req: MinimalRequest) => string | undefined
  /** 'respond' (default) sends errors; 'next' forwards to your middleware. */
  onError?: 'respond' | 'next'
}

export function createNotificationHandlers(
  store: NotificationStore,
  options: NotificationHandlersOptions = {},
) {
  const wrap = options.wrapResponse ?? ((d: unknown) => d)
  const getUserId = options.getUserId ?? ((req) => req.auth?.userId)

  function guarded(fn: (req: MinimalRequest, userId: string) => Promise<unknown>): Handler {
    return async (req, res, next) => {
      const userId = getUserId(req)
      if (!userId) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } })
        return
      }
      try {
        res.json(wrap(await fn(req, userId)))
      } catch (err) {
        if (options.onError === 'next' && next) next(err)
        else res.status(500).json({ error: { code: 'InternalError', message: 'Something went wrong' } })
      }
    }
  }

  return {
    /** GET ?limit=&before= → NotificationRecord[] (newest first). */
    list: guarded(async (req, userId) => {
      const limitRaw = Number(req.query?.limit)
      const beforeRaw = typeof req.query?.before === 'string' ? new Date(req.query.before) : undefined
      return store.listByUser(userId, {
        limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : undefined,
        before: beforeRaw && !Number.isNaN(beforeRaw.getTime()) ? beforeRaw : undefined,
      })
    }),

    /** GET → { count } for the bell badge. */
    unreadCount: guarded(async (_req, userId) => ({ count: await store.unreadCount(userId) })),

    /** POST /:id/read → { ok } (idempotent). */
    markRead: guarded(async (req, userId) => {
      const id = typeof req.params?.id === 'string' ? req.params.id : ''
      await store.markRead(userId, id)
      return { ok: true }
    }),

    /** POST → { ok }. */
    markAllRead: guarded(async (_req, userId) => {
      await store.markAllRead(userId)
      return { ok: true }
    }),
  }
}
