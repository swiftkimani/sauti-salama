import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

const same = (a: unknown, b: string) => {
  if (typeof a !== 'string' || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Africa's Talking does not sign its callbacks, so once the webhooks are on a public URL anyone could
 * post fake reports (and, in live mode, make us send SMS to any number). When WEBHOOK_SECRET is set,
 * a callback must carry it as ?key=... in the URL configured on the Africa's Talking dashboard.
 * The simulator is let through with the console token instead.
 */
@Injectable()
export class WebhookGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) return true;
    const req = ctx.switchToHttp().getRequest();
    if (same(req.query?.key, secret)) return true;
    if (same(req.headers['x-dashboard-token'], process.env.DASHBOARD_TOKEN || 'demo-token')) return true;
    throw new UnauthorizedException('Webhook key missing or wrong');
  }
}

/** Appends ?key=WEBHOOK_SECRET to a callback URL when a secret is configured. */
export function withWebhookKey(url: string): string {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return url;
  return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(secret)}`;
}
