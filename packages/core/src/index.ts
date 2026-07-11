/**
 * @aymenkits/notify-core — one notify(), every channel.
 *
 * Quick start:
 *   const notifier = createNotifier({
 *     store: myNotificationStore,                       // your table
 *     render: (event, channel) => templates[event.type]?.(event, channel) ?? null,
 *     channels: {
 *       push: fcmPushSender(admin.messaging(), { tokens: myDeviceTokenStore }),
 *       email: smtpEmailSender(transporter, { from, emailForUser }),
 *       sms: twilioSmsSender(twilio, { from, phoneForUser }),
 *       realtime: socketIoEmitter(io),
 *     },
 *     resolvePreferences: (userId, type) => prefsFor(userId, type), // optional
 *   })
 *   await notifier.notify(order.customerId, { type: 'order.accepted', data: { orderId } })
 */
export type {
  Channel,
  NotifyEvent,
  RenderedMessage,
  NotificationRecord,
  NotificationStore,
  PreferenceResolver,
  TemplateRenderer,
  ChannelSender,
  RealtimeEmitter,
  ChannelFailure,
  NotifyResult,
} from './types'

export { createNotifier } from './notifier'
export type { Notifier, NotifierChannels, CreateNotifierArgs } from './notifier'

export {
  fcmPushSender,
  smtpEmailSender,
  twilioSmsSender,
  socketIoEmitter,
  consoleChannel,
} from './adapters'
export type {
  FcmMessaging,
  FcmMulticastResult,
  DeviceTokenStore,
  MailTransport,
  SmsClient,
  SocketIoLike,
} from './adapters'

export { createInMemoryNotificationStore } from './memory'
