import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { withWebhookKey } from './channels/webhook.guard';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.enableCors();
  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  const base = `http://localhost:${port}`;
  const token = process.env.DASHBOARD_TOKEN || 'demo-token';
  console.log(`\nSauti Salama backend listening on ${base}`);
  console.log(`  Responder console : ${base}/dashboard.html${token === 'demo-token' ? '?token=demo-token' : ' (sign in with DASHBOARD_TOKEN from .env)'}`);
  console.log(`  Channel simulator : ${base}/simulator.html`);

  const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const hook = (path: string) => withWebhookKey(`${publicBase || base}${path}`);
  console.log(`\n  Africa's Talking callback URLs (paste these into the dashboard):`);
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
  if (publicBase.startsWith('https://') && !process.env.WEBHOOK_SECRET) {
    console.warn('  WARNING: the webhooks are public but WEBHOOK_SECRET is not set, so anyone can post fake reports.\n');
  }
}
bootstrap();
