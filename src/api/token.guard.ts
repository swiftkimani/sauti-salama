import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { safeEqual } from '../common/safe-equal';
import { dashboardToken } from '../config/env';

/** PoC-grade console auth: a shared token. Production: responder accounts with roles + audit (see docs/SAFETY_PRIVACY_COMPLIANCE.md). */
@Injectable()
export class TokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const given = req.headers['x-dashboard-token'] || req.query?.token;
    if (!safeEqual(given, dashboardToken())) throw new UnauthorizedException('Console token missing or wrong');
    return true;
  }
}
