import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { VoiceService } from './channels/voice/voice.service';
import { assertProductionConfig, dashboardToken, demoSignInEnabled, isProduction, trustProxySetting } from './config/env';
import { buildOpenApi } from './config/openapi';

async function bootstrap() {
  assertProductionConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  app.set('trust proxy', trustProxySetting());
  app.useStaticAssets(join(__dirname, '..', 'public'));
  // The console is served from this origin. Cross-origin use is opt-in in production.
  const origins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : !isProduction() });
  app.enableShutdownHooks();
  const docs = !isProduction() || process.env.API_DOCS === 'true';
  if (docs) SwaggerModule.setup('api/docs', app, buildOpenApi(app));
  const port = Number(process.env.PORT || 3000);
  await app.listen(port);

  const base = `http://localhost:${port}`;
  const token = dashboardToken();
  console.log(`\nSauti Salama backend listening on ${base}`);
  console.log(`  Responder console : ${base}/dashboard.html${demoSignInEnabled() ? ' (opens without signing in)' : ' (sign in with DASHBOARD_TOKEN from .env)'}`);
  console.log(`  Channel simulator : ${base}/simulator.html`);
  if (docs) console.log(`  API docs          : ${base}/api/docs`);

  // The secret is never printed: logs get copied and shipped. `npm run at:check` prints the full URLs locally.
  const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const hook = (path: string) => `${publicBase || base}${path}${process.env.WEBHOOK_SECRET ? '?key=<WEBHOOK_SECRET>' : ''}`;
  console.log(`\n  Africa's Talking callback URLs (\`npm run at:check\` prints them ready to paste):`);
  console.log(`    USSD                 : ${hook('/webhooks/ussd')}`);
  console.log(`    SMS incoming         : ${hook('/webhooks/sms')}`);
  console.log(`    SMS delivery reports : ${hook('/webhooks/sms/delivery')}`);
  console.log(`    Voice                : ${hook('/webhooks/voice')}\n`);
  if (process.env.AT_API_KEY && !/^https:\/\//.test(publicBase)) {
    console.warn('  WARNING: AT_API_KEY is set but PUBLIC_BASE_URL is not an https:// URL. Africa\'s Talking cannot reach localhost; run `npm run tunnel` and set PUBLIC_BASE_URL.\n');
  }
  if (publicBase.startsWith('https://') && token === 'demo-token') {
    console.warn('  WARNING: the server is public but DASHBOARD_TOKEN is still demo-token. Set a strong token in .env.\n');
  }
  if (publicBase.startsWith('https://') && demoSignInEnabled()) {
    console.warn('  WARNING: the server is public and not in production mode, so /api/demo-access hands the console token to anyone who opens it and the console needs no sign-in. Intended for a proof of concept only: run with NODE_ENV=production to close it.\n');
  }
  if (publicBase.startsWith('https://') && !process.env.WEBHOOK_SECRET) {
    console.warn('  WARNING: the webhooks are public but WEBHOOK_SECRET is not set, so anyone can post fake reports. (With NODE_ENV=production they are refused.)\n');
  }
  for (const w of app.get(VoiceService).readiness().warnings) console.warn(`  NOTE: ${w}`);
}

process.on('unhandledRejection', (e) => new Logger('Process').error(`Unhandled rejection: ${e instanceof Error ? e.stack : e}`));

bootstrap().catch((e) => {
  console.error(`\nSauti Salama did not start: ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
