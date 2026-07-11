/**
 * Notification domain + seams. The kit owns the fan-out BEHAVIOR; the app owns
 * storage (its notifications table), templates (copy/i18n), the event catalog
 * and preference data. Same seam pattern as the other kits.
 */

export type Channel = 'IN_APP' | 'PUSH' | 'EMAIL' | 'SMS' | 'REALTIME'

/** An app event to notify about, e.g. { type: 'order.accepted', data: { orderId } }. */
export interface NotifyEvent<D = unknown> {
  type: string
  data?: D
}

/** What a channel actually delivers (built by the app's TemplateRenderer). */
export interface RenderedMessage {
  title: string
  body: string
  /** Deep-link / client payload (FCM data, socket payload, in-app record data). */
  data?: Record<string, unknown>
}

/** One in-app notification row — the source of truth for the bell/badge. */
export interface NotificationRecord {
  id: string
  userId: string
  /** The event type ('order.accepted', …) for client-side routing. */
  type: string
  title: string
  body: string
  data: Record<string, unknown> | null
  readAt: Date | null
  createdAt: Date
}

export interface NotificationStore {
  create(
    userId: string,
    input: { type: string; title: string; body: string; data?: Record<string, unknown> },
  ): Promise<NotificationRecord>
  listByUser(userId: string, opts?: { limit?: number; before?: Date }): Promise<NotificationRecord[]>
  unreadCount(userId: string): Promise<number>
  markRead(userId: string, id: string): Promise<void>
  markAllRead(userId: string): Promise<void>
}

/**
 * Which channels a user gets for an event type. Preference DATA stays in the
 * app (e.g. a JSONB preferences column); this is just the lookup.
 * Omit to send through every configured channel.
 */
export type PreferenceResolver = (
  userId: string,
  eventType: string,
) => Channel[] | Promise<Channel[]>

/**
 * App-side templates: turn an event into channel-appropriate copy.
 * Return null to skip that channel for that event type.
 */
export type TemplateRenderer = (
  event: NotifyEvent,
  channel: Channel,
) => RenderedMessage | null | Promise<RenderedMessage | null>

/** Push / email / SMS delivery. The app resolves contact info inside its adapter. */
export interface ChannelSender {
  send(userId: string, message: RenderedMessage, event: NotifyEvent): Promise<void>
}

/** Live in-app delivery (Socket.IO or anything with rooms). */
export interface RealtimeEmitter {
  emitToUser(userId: string, eventName: string, payload: unknown): void | Promise<void>
}

export interface ChannelFailure {
  channel: Channel
  error: Error
}

/** Per-user outcome of a notify() call. */
export interface NotifyResult {
  userId: string
  /** The stored in-app record (null when IN_APP was skipped or filtered). */
  record: NotificationRecord | null
  delivered: Channel[]
  failed: ChannelFailure[]
}
