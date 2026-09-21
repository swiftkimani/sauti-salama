/*
 * Writes docs/openapi.json from the controllers and DTOs, without a database or any secrets
 * (preview mode builds the module graph but instantiates nothing). Run after changing an endpoint: npm run openapi
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { buildOpenApi } from '../src/config/openapi';

async function main() {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  const file = join(__dirname, '..', 'docs', 'openapi.json');
  writeFileSync(file, `${JSON.stringify(buildOpenApi(app), null, 2)}\n`);
  await app.close();
  console.log(`Wrote ${file}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
