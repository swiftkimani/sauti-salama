import 'dotenv/config';
import { DataSource } from 'typeorm';
import { postgresOptions } from './database';

/**
 * Entry point for the TypeORM CLI (npm run migration:*). Migrations target PostgreSQL only;
 * the sql.js demo database follows the entities by itself.
 */
export default new DataSource(postgresOptions());
