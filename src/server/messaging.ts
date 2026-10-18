import { sql } from './db';
import { env, isProduction } from './env';
import { AppError } from './errors';

/**
 * Outbound messaging adapters. No real provider is connected yet:
 *   - EMAIL_PROVIDER / SMS_PROVIDER = none → "disconnected".
 *   - In development with LUMA_DEV_OTP=1 messages go to dev_outbox_messages
 *     and are viewable at /dev/outbox, clearly labeled as not sent.
 * Production refuses to pretend: callers receive an `unavailable` error.
 */
export type Channel = 'email' | 'sms';

export interface OutboundMessage {
  channel: Channel;
  destination: string;
  subject?: string;
  body: string;
}

export interface DeliveryResult {
  mode: 'provider' | 'dev_outbox';
}

export function messagingStatus(): Record<Channel, 'connected' | 'dev_outbox' | 'disconnected'> {
  const e = env();
  const dev = !isProduction() && e.LUMA_DEV_OTP;
  return {
    email: e.EMAIL_PROVIDER !== 'none' ? 'connected' : dev ? 'dev_outbox' : 'disconnected',
    sms: e.SMS_PROVIDER !== 'none' ? 'connected' : dev ? 'dev_outbox' : 'disconnected',
  };
}

export async function deliver(msg: OutboundMessage): Promise<DeliveryResult> {
  const status = messagingStatus()[msg.channel];
  if (status === 'dev_outbox') {
    if (isProduction()) throw new Error('dev outbox is disabled in production');
    await sql()`insert into dev_outbox_messages (channel, destination, subject, body)
                values (${msg.channel}, ${msg.destination}, ${msg.subject ?? null}, ${msg.body})`;
    return { mode: 'dev_outbox' };
  }
  if (status === 'connected') {
    // Provider adapters are added here once a provider is approved and verified.
    throw new AppError('unavailable', 'errors.provider_unavailable', { channel: msg.channel });
  }
  throw new AppError('unavailable', 'errors.provider_unavailable', { channel: msg.channel });
}
