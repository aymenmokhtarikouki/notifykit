/**
 * The dispatcher. Semantics:
 *
 * 1. The IN_APP record is written FIRST — it is the source of truth feeding
 *    the bell/unread badge, and the payload realtime clients receive.
 * 2. Every other channel is fanned out with ERROR ISOLATION: a dead SMTP
 *    server never blocks the push; failures are collected per channel and
 *    reported via `onError` + the returned NotifyResult, never thrown.
 * 3. Channel selection: PreferenceResolver when provided, otherwise every
 *    configured channel. A channel is also skipped when the app's renderer
 *    returns null for it (event-type level opt-out).
 *
 * No queue in v1 — both current apps are single-node; a queue can wrap
 * `notify` later without changing callers.
 */
import type {
  Channel,
  ChannelFailure,
  ChannelSender,
  NotificationRecord,
  NotificationStore,
  NotifyEvent,
  NotifyResult,
  PreferenceResolver,
  RealtimeEmitter,
  RenderedMessage,
  TemplateRenderer,
} from './types'

export interface NotifierChannels {
  push?: ChannelSender
  email?: ChannelSender
  sms?: ChannelSender
  realtime?: RealtimeEmitter
}

export interface CreateNotifierArgs {
  store: NotificationStore
  /** App templates: (event, channel) → message, or null to skip the channel. */
  render: TemplateRenderer
  channels?: NotifierChannels
  /** Per-user channel filter (preference data stays app-side). */
  resolvePreferences?: PreferenceResolver
  /** Socket event name for realtime delivery. Default 'notification'. */
  realtimeEventName?: string
  /** Observability hook for channel failures (already isolated). */
  onError?: (failure: ChannelFailure & { userId: string; event: NotifyEvent }) => void
}

export interface Notifier {
  /** Notify one or many users about an event. Never throws for delivery errors. */
  notify(userIds: string | string[], event: NotifyEvent): Promise<NotifyResult[]>
}

const SENDER_CHANNELS: Array<'PUSH' | 'EMAIL' | 'SMS'> = ['PUSH', 'EMAIL', 'SMS']

export function createNotifier(args: CreateNotifierArgs): Notifier {
  const { store, render, resolvePreferences, onError } = args
  const channels = args.channels ?? {}
  const realtimeEventName = args.realtimeEventName ?? 'notification'

  function configuredChannels(): Channel[] {
    const list: Channel[] = ['IN_APP']
    if (channels.push) list.push('PUSH')
    if (channels.email) list.push('EMAIL')
    if (channels.sms) list.push('SMS')
    if (channels.realtime) list.push('REALTIME')
    return list
  }

  function senderFor(channel: 'PUSH' | 'EMAIL' | 'SMS'): ChannelSender | undefined {
    return channel === 'PUSH' ? channels.push : channel === 'EMAIL' ? channels.email : channels.sms
  }

  async function notifyOne(userId: string, event: NotifyEvent): Promise<NotifyResult> {
    const wanted = resolvePreferences
      ? await resolvePreferences(userId, event.type)
      : configuredChannels()

    const delivered: Channel[] = []
    const failed: ChannelFailure[] = []
    let record: NotificationRecord | null = null

    // 1. In-app record first — source of truth.
    if (wanted.includes('IN_APP')) {
      const message = await render(event, 'IN_APP')
      if (message) {
        record = await store.create(userId, {
          type: event.type,
          title: message.title,
          body: message.body,
          data: message.data,
        })
        delivered.push('IN_APP')
      }
    }

    // 2. Push / email / SMS — isolated fan-out.
    for (const channel of SENDER_CHANNELS) {
      const sender = senderFor(channel)
      if (!sender || !wanted.includes(channel)) continue
      try {
        const message = await render(event, channel)
        if (!message) continue
        await sender.send(userId, message, event)
        delivered.push(channel)
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        failed.push({ channel, error })
        onError?.({ channel, error, userId, event })
      }
    }

    // 3. Realtime: emit the stored record (clients prepend it + bump the badge),
    //    falling back to a REALTIME-rendered message for record-less events.
    if (channels.realtime && wanted.includes('REALTIME')) {
      try {
        const payload = record ?? (await render(event, 'REALTIME'))
        if (payload) {
          await channels.realtime.emitToUser(userId, realtimeEventName, {
            type: event.type,
            record,
            message: record ? null : payload,
          })
          delivered.push('REALTIME')
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        failed.push({ channel: 'REALTIME', error })
        onError?.({ channel: 'REALTIME', error, userId, event })
      }
    }

    return { userId, record, delivered, failed }
  }

  return {
    async notify(userIds, event) {
      const ids = Array.isArray(userIds) ? userIds : [userIds]
      const results: NotifyResult[] = []
      for (const id of ids) results.push(await notifyOne(id, event))
      return results
    },
  }
}
