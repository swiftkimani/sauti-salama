import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TokenGuard } from '../src/api/token.guard';
import { WebhookGuard } from '../src/channels/webhook.guard';
import { CryptoService } from '../src/common/crypto.service';
import { assertProductionConfig, dashboardToken, productionConfigProblems, trustProxySetting } from '../src/config/env';

const KEY = 'a'.repeat(64);
const SECRET = 's'.repeat(40);
const ready = { NODE_ENV: 'production', ENCRYPTION_KEY: KEY, HASH_PEPPER: 'p'.repeat(40), DASHBOARD_TOKEN: 't'.repeat(40), WEBHOOK_SECRET: SECRET, PUBLIC_BASE_URL: 'https://line.example.org', DB_TYPE: 'postgres' };

const ctx = (req: { query?: Record<string, string>; headers?: Record<string, string> }) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ query: {}, headers: {}, ...req }) }) }) as unknown as ExecutionContext;

describe('production configuration', () => {
  it('lists every missing or dev-default secret', () => {
    const problems = productionConfigProblems({ NODE_ENV: 'production', DASHBOARD_TOKEN: 'demo-token', HASH_PEPPER: 'change-me-to-a-long-random-string', DB_SYNC: 'true' });
    expect(problems.join('\n')).toMatch(/ENCRYPTION_KEY/);
    expect(problems.join('\n')).toMatch(/HASH_PEPPER/);
    expect(problems.join('\n')).toMatch(/DASHBOARD_TOKEN/);
    expect(problems.join('\n')).toMatch(/WEBHOOK_SECRET/);
    expect(problems.join('\n')).toMatch(/PUBLIC_BASE_URL/);
    expect(problems.join('\n')).toMatch(/DB_TYPE must be postgres/);
    expect(problems.join('\n')).toMatch(/DB_SYNC/);
  });

  it('accepts a complete production configuration', () => {
    expect(productionConfigProblems(ready)).toEqual([]);
    expect(() => assertProductionConfig(ready)).not.toThrow();
  });

  it('refuses to start in production with problems, and never checks outside production', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'production' })).toThrow(/Refusing to start/);
    expect(() => assertProductionConfig({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('only has a demo console token outside production', () => {
    expect(dashboardToken({})).toBe('demo-token');
    expect(dashboardToken({ NODE_ENV: 'production' })).toBe('');
  });

  it('trusts only a local proxy by default', () => {
    expect(trustProxySetting(undefined)).toBe('loopback');
    expect(trustProxySetting('1')).toBe(1);
    expect(trustProxySetting('false')).toBe(false);
    expect(trustProxySetting('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
  });
});

describe('CryptoService', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('round-trips and detects tampering without throwing on the safe path', () => {
    process.env.ENCRYPTION_KEY = KEY;
    const crypto = new CryptoService();
    const enc = crypto.encrypt('+254712345678');
    expect(enc).not.toContain('254712345678');
    expect(crypto.decrypt(enc)).toBe('+254712345678');
    const [v, iv, tag, data] = enc.split('.');
    const tampered = [v, iv, tag, Buffer.from('tampered').toString('base64') + data.slice(12)].join('.');
    expect(() => crypto.decrypt(tampered)).toThrow();
    expect(crypto.tryDecrypt(tampered)).toBeNull();
    expect(crypto.tryDecrypt('garbage')).toBeNull();
  });

  it('cannot read data written under another key', () => {
    process.env.ENCRYPTION_KEY = KEY;
    const enc = new CryptoService().encrypt('narrative');
    process.env.ENCRYPTION_KEY = 'b'.repeat(64);
    expect(new CryptoService().tryDecrypt(enc)).toBeNull();
  });

  it('refuses the public dev key and pepper in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new CryptoService()).toThrow(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = KEY;
    expect(() => new CryptoService()).toThrow(/HASH_PEPPER/);
    process.env.HASH_PEPPER = 'p'.repeat(40);
    expect(() => new CryptoService()).not.toThrow();
  });

  it('hashes phone numbers stably per pepper', () => {
    process.env.HASH_PEPPER = 'one';
    const a = new CryptoService().hash('+254712345678');
    expect(new CryptoService().hash('+254712345678')).toBe(a);
    process.env.HASH_PEPPER = 'two';
    expect(new CryptoService().hash('+254712345678')).not.toBe(a);
  });
});

describe('WebhookGuard', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  const guard = new WebhookGuard();

  it('is open for local testing when no secret is set, outside production', () => {
    expect(guard.canActivate(ctx({}))).toBe(true);
  });

  it('fails closed in production when no secret is set', () => {
    process.env.NODE_ENV = 'production';
    expect(() => guard.canActivate(ctx({ query: { key: 'anything' } }))).toThrow(UnauthorizedException);
  });

  it('requires the key once a secret is set', () => {
    process.env.WEBHOOK_SECRET = SECRET;
    expect(guard.canActivate(ctx({ query: { key: SECRET } }))).toBe(true);
    expect(() => guard.canActivate(ctx({ query: { key: 'wrong' } }))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
  });

  it('lets the simulator through with the console token, but never in production', () => {
    process.env.WEBHOOK_SECRET = SECRET;
    process.env.DASHBOARD_TOKEN = 't'.repeat(40);
    const simulator = ctx({ headers: { 'x-dashboard-token': 't'.repeat(40) } });
    expect(guard.canActivate(simulator)).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(() => guard.canActivate(simulator)).toThrow(UnauthorizedException);
  });
});

describe('TokenGuard', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  const guard = new TokenGuard();

  it('accepts the token by header or query and refuses anything else', () => {
    process.env.DASHBOARD_TOKEN = 'console-token-for-tests';
    expect(guard.canActivate(ctx({ headers: { 'x-dashboard-token': 'console-token-for-tests' } }))).toBe(true);
    expect(guard.canActivate(ctx({ query: { token: 'console-token-for-tests' } }))).toBe(true);
    expect(() => guard.canActivate(ctx({ headers: { 'x-dashboard-token': 'console-token-for-test' } }))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
  });

  it('does not accept demo-token in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => guard.canActivate(ctx({ headers: { 'x-dashboard-token': 'demo-token' } }))).toThrow(UnauthorizedException);
  });
});

describe('CryptoService authentication tags', () => {
  it('refuses a truncated GCM tag even when the prefix is right', () => {
    const crypto = new CryptoService();
    const [v, iv, tag, data] = crypto.encrypt('secret').split('.');
    const short = Buffer.from(tag, 'base64').subarray(0, 4).toString('base64');
    expect(() => crypto.decrypt([v, iv, short, data].join('.'))).toThrow(/authentication tag/);
  });
});
