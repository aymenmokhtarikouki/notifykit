/**
 * Ready-made channel adapters — zero dependencies. Each factory takes the
 * app's ALREADY-CONFIGURED client (firebase-admin messaging, nodemailer
 * transporter, twilio client, socket.io server) via structural typing, plus
 * an app callback to resolve contact info / device tokens (the app owns its
 * user table — the kit never queries it directly).
 */
import type { ChannelSender, RealtimeEmitter } from './types'

// ── FCM push (firebase-admin messaging shape) ────────────────────────────────

export interface FcmMulticastResult {
  responses: Array<{ success: boolean; error?: { code?: string } }>
}
export interface FcmMessaging {
  sendEachForMulticast(message: {
    tokens: string[]
    notification: { title: string; body: string }
    data?: Record<string, string>
  }): Promise<FcmMulticastResult>
}
export interface DeviceTokenStore {
  tokensForUser(userId: string): Promise<string[]>
  /** Called with tokens FCM reported dead — prune them (the classic FCM chore). */
  removeTokens?(userId: string, tokens: string[]): Promise<void>
}

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
])

export function fcmPushSender(
  messaging: FcmMessaging,
  opts: { tokens: DeviceTokenStore },
): ChannelSender {
  return {
    async send(userId, message) {
      const tokens = await opts.tokens.tokensForUser(userId)
      if (tokens.length === 0) return // no devices — a no-op, not an error

      // FCM data values must be strings.
      const data: Record<string, string> = {}
      for (const [k, v] of Object.entries(message.data ?? {})) {
        data[k] = typeof v === 'string' ? v : JSON.stringify(v)
      }

      const result = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: message.title, body: message.body },
        ...(Object.keys(data).length > 0 ? { data } : {}),
      })

      const dead = tokens.filter((_, i) => {
        const r = result.responses[i]
        return r && !r.success && DEAD_TOKEN_CODES.has(r.error?.code ?? '')
      })
      if (dead.length > 0 && opts.tokens.removeTokens) {
        await opts.tokens.removeTokens(userId, dead)
      }
    },
  }
}

// ── Email (nodemailer shape) ─────────────────────────────────────────────────

export interface MailTransport {
  sendMail(options: { from: string; to: string; subject: string; text: string }): Promise<unknown>
}

export function smtpEmailSender(
  transport: MailTransport,
  opts: {
    from: string
    /** Resolve the user's email; return null to skip silently (no address on file). */
    emailForUser: (userId: string) => Promise<string | null>
  },
): ChannelSender {
  return {
    async send(userId, message) {
      const to = await opts.emailForUser(userId)
      if (!to) return
      await transport.sendMail({ from: opts.from, to, subject: message.title, text: message.body })
    },
  }
}

// ── SMS (twilio shape) ───────────────────────────────────────────────────────

export interface SmsClient {
  messages: { create(options: { from: string; to: string; body: string }): Promise<unknown> }
}

export function twilioSmsSender(
  client: SmsClient,
  opts: {
    from: string
    /** Resolve the user's phone; return null to skip silently. */
    phoneForUser: (userId: string) => Promise<string | null>
  },
): ChannelSender {
  return {
    async send(userId, message) {
      const to = await opts.phoneForUser(userId)
      if (!to) return
      await client.messages.create({ from: opts.from, to, body: `${message.title}: ${message.body}` })
    },
  }
}

// ── Realtime (socket.io shape) ───────────────────────────────────────────────

export interface SocketIoLike {
  to(room: string): { emit(event: string, payload: unknown): unknown }
}

export function socketIoEmitter(
  io: SocketIoLike,
  opts?: { roomForUser?: (userId: string) => string },
): RealtimeEmitter {
  const room = opts?.roomForUser ?? ((userId: string) => `user:${userId}`)
  return {
    emitToUser(userId, eventName, payload) {
      io.to(room(userId)).emit(eventName, payload)
    },
  }
}

// ── Dev/demo ─────────────────────────────────────────────────────────────────

export function consoleChannel(label: string): ChannelSender {
  return {
    async send(userId, message) {
      console.log(`[notifykit/${label}] → ${userId}: ${message.title} — ${message.body}`)
    },
  }
}
