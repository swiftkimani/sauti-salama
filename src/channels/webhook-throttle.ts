import { Throttle } from '@nestjs/throttler';

/**
 * Africa's Talking calls from a handful of IP addresses, so a per-IP limit on webhooks is really a ceiling on the
 * whole line's traffic. It is set high (a surge of real reports must not be refused) and exists to blunt a flood if
 * WEBHOOK_SECRET leaks. Per-phone limits in the channel services do the fine-grained work.
 */
export const WebhookThrottle = () => Throttle({ default: { limit: () => Number(process.env.WEBHOOK_RATE_LIMIT_PER_MINUTE ?? 600), ttl: 60 * 1000 } });
