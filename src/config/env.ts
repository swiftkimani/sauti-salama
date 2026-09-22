/**
 * Runtime configuration checks. A local demo must keep working with zero setup, so missing secrets fall back to
 * dev values with a warning. With NODE_ENV=production the server refuses to start instead: a GBV line must never
 * run on a published key, open webhooks or a schema that changes itself.
 */
export const isProduction = (env: NodeJS.ProcessEnv = process.env) => env.NODE_ENV === 'production';

const HEX64 = /^[0-9a-fA-F]{64}$/;
export const isEncryptionKey = (v: string | undefined) => !!v && HEX64.test(v);

/** The console token of a demo deployment. It is printed in the README and in .env.example, so it is never a secret. */
export const DEMO_TOKEN = 'demo-token';

const DEV_DEFAULTS = [DEMO_TOKEN, 'change-me-to-a-long-random-string'];
const strongSecret = (v: string | undefined) => !!v && v.length >= 32 && !DEV_DEFAULTS.includes(v);

/** Everything that must be fixed before the server may run in production. Empty means ready. */
export function productionConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const p: string[] = [];
  if (!isEncryptionKey(env.ENCRYPTION_KEY)) p.push('ENCRYPTION_KEY must be 64 hex characters (npm run keygen)');
  if (!strongSecret(env.HASH_PEPPER)) p.push('HASH_PEPPER must be a random string of at least 32 characters (npm run keygen)');
  if (!strongSecret(env.DASHBOARD_TOKEN)) p.push('DASHBOARD_TOKEN must be a random string of at least 32 characters (npm run keygen)');
  if (!strongSecret(env.WEBHOOK_SECRET)) p.push('WEBHOOK_SECRET must be a random string of at least 32 characters (npm run keygen)');
  if (!/^https:\/\//.test(env.PUBLIC_BASE_URL || '')) p.push('PUBLIC_BASE_URL must be the public https:// address Africa\'s Talking calls back');
  if ((env.DB_TYPE || 'sqljs').toLowerCase() !== 'postgres') p.push('DB_TYPE must be postgres (sql.js keeps the whole database in memory)');
  if (env.DB_SYNC === 'true') p.push('DB_SYNC=true is not allowed: schema changes go through migrations');
  return p;
}

export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (!isProduction(env)) return;
  const problems = productionConfigProblems(env);
  if (problems.length) throw new Error(`Refusing to start with NODE_ENV=production:\n  - ${problems.join('\n  - ')}`);
}

/** The console token. The demo value only exists outside production; in production an unset token matches nothing. */
export const dashboardToken = (env: NodeJS.ProcessEnv = process.env): string => env.DASHBOARD_TOKEN || (isProduction(env) ? '' : DEMO_TOKEN);

/**
 * May the console open without credentials? Only outside production, where this is a proof of concept and the
 * console token is demo-grade anyway: `webhook.guard.ts` already accepts it as a webhook key there, and the
 * README publishes it. Such a deployment hands the token to anyone who opens the page (GET /api/demo-access),
 * which is what makes the live PoC link open with no sign-in. With NODE_ENV=production the answer is always no.
 */
export const demoSignInEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => !isProduction(env) && !!dashboardToken(env);

/** Express "trust proxy": by default only a proxy on the same host (cloudflared, nginx) may set X-Forwarded-For. */
export function trustProxySetting(v = process.env.TRUST_PROXY): boolean | number | string {
  if (v === undefined || v === '') return 'loopback';
  if (v === 'true' || v === 'false') return v === 'true';
  return /^\d+$/.test(v) ? Number(v) : v;
}
