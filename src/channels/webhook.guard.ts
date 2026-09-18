import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { safeEqual } from '../common/safe-equal';
import { dashboardToken, isProduction } from '../config/env';

/**
 * Africa's Talking does not sign its callbacks, so once the webhooks are on a public URL anyone could
 * post fake reports (and, in live mode, make us send SMS to any number). A callback must carry
 * WEBHOOK_SECRET as ?key=... in the URL configured on the Africa's Talking dashboard.
 *
 * Fails closed in production: no secret means no webhooks. Outside production an unset secret leaves the
 * webhooks open for local testing (main.ts warns when the server is public), and the simulator is let
 * through with the console token.
 */
@Injectable()
export class WebhookGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
      if (isProduction()) throw new UnauthorizedException('Webhooks are disabled: WEBHOOK_SECRET is not set');
      return true;
    }
    const req = ctx.switchToHttp().getRequest();
    if (safeEqual(req.query?.key, secret)) return true;
    if (!isProduction() && safeEqual(req.headers['x-dashboard-token'], dashboardToken())) return true;
    throw new UnauthorizedException('Webhook key missing or wrong');
  }
}

/** Appends ?key=WEBHOOK_SECRET to a callback URL when a secret is configured. */
export function withWebhookKey(url: string): string {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return url;
  return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(secret)}`;
}
