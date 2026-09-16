import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/** PoC-grade console auth: a shared token. Production: responder accounts with roles + audit (see docs/SAFETY_PRIVACY_COMPLIANCE.md). */
@Injectable()
export class TokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const expected = process.env.DASHBOARD_TOKEN || 'demo-token';
    const given = req.headers['x-dashboard-token'] || req.query?.token;
    if (given !== expected) throw new UnauthorizedException('Console token missing or wrong');
    return true;
  }
}
