import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { DataSourceOptions } from 'typeorm';
import { entities } from '../entities';

/**
 * PostgreSQL: the schema is owned by migrations in src/migrations (applied on start unless DB_MIGRATE_ON_START=false,
 * or with `npm run migration:run`). DB_SYNC=true lets a developer iterate on entities against a throwaway database;
 * production refuses it.
 */
export function postgresOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities,
    migrations: [path.join(__dirname, '..', 'migrations', '*.{js,ts}')],
    synchronize: process.env.DB_SYNC === 'true',
    migrationsRun: process.env.DB_MIGRATE_ON_START !== 'false',
    logging: false,
  };
}

/**
 * sqljs  -> zero-setup file database (default). Good for the hackathon PoC and judges; its schema follows the
 *           entities automatically. SQLITE_PATH=:memory: keeps it in memory (tests).
 * postgres -> production. `docker compose up` starts one; set DB_TYPE=postgres.
 * Sensitive fields are encrypted by the application (see CryptoService) so the
 * privacy guarantees do not depend on which database is used.
 */
export function buildTypeOrmOptions(): TypeOrmModuleOptions {
  const type = (process.env.DB_TYPE || 'sqljs').toLowerCase();
  if (type === 'postgres') return postgresOptions();
  if (process.env.SQLITE_PATH === ':memory:') return { type: 'sqljs', entities, synchronize: true, logging: false };
  const location = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'sauti-salama.sqlite');
  fs.mkdirSync(path.dirname(location), { recursive: true });
  return { type: 'sqljs', location, autoSave: true, entities, synchronize: true, logging: false };
}
