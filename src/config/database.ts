import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { entities } from '../entities';

/**
 * sqljs  -> zero-setup file database (default). Good for the hackathon PoC and judges.
 * postgres -> production. `docker compose up` starts one; set DB_TYPE=postgres.
 * Sensitive fields are encrypted by the application (see CryptoService) so the
 * privacy guarantees do not depend on which database is used.
 */
export function buildTypeOrmOptions(): TypeOrmModuleOptions {
  const type = (process.env.DB_TYPE || 'sqljs').toLowerCase();
  if (type === 'postgres') {
    return {
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities,
      synchronize: process.env.DB_SYNC !== 'false',
      logging: false,
    };
  }
  const location = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'sauti-salama.sqlite');
  fs.mkdirSync(path.dirname(location), { recursive: true });
  return { type: 'sqljs', location, autoSave: true, entities, synchronize: true, logging: false };
}
