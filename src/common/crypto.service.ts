import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { isEncryptionKey, isProduction } from '../config/env';

/**
 * Application-level encryption for sensitive personal data (Kenya DPA 2019 s.2:
 * health, sex life, and by extension GBV disclosures). AES-256-GCM per field,
 * HMAC-SHA256 for lookups (so a phone number can be matched without storing it).
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;
  private readonly pepper: string;

  constructor() {
    const hex = process.env.ENCRYPTION_KEY;
    if (isEncryptionKey(hex)) {
      this.key = Buffer.from(hex, 'hex');
    } else if (isProduction()) {
      // The dev key is public (it is in this file), so data "encrypted" with it is not encrypted at all.
      throw new Error('ENCRYPTION_KEY (64 hex characters) is required in production. Run `npm run keygen`.');
    } else {
      this.key = crypto.createHash('sha256').update('sauti-salama-dev-only-key').digest();
      this.logger.warn('ENCRYPTION_KEY is not set: using a DEV key. Run `npm run keygen` and set it before any real use.');
    }
    if (process.env.HASH_PEPPER) {
      this.pepper = process.env.HASH_PEPPER;
    } else if (isProduction()) {
      throw new Error('HASH_PEPPER is required in production. Run `npm run keygen`.');
    } else {
      this.pepper = 'sauti-salama-dev-pepper';
    }
  }

  encrypt(plain: string): string {
    if (plain === null || plain === undefined) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
  }

  decrypt(payload: string): string {
    if (!payload) return null;
    const [v, iv, tag, data] = payload.split('.');
    if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Unknown ciphertext format');
    const authTag = Buffer.from(tag, 'base64');
    // Only full 128-bit tags: a truncated tag would make forging a ciphertext far easier.
    if (authTag.length !== 16) throw new Error('Invalid authentication tag');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'), { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }

  /**
   * decrypt() for request paths: corrupt ciphertext, or ciphertext written under another key, reads as null
   * instead of failing a half-finished update. The payload itself is never logged.
   */
  tryDecrypt(payload: string, what = 'field'): string | null {
    try {
      return this.decrypt(payload);
    } catch (e) {
      this.logger.error(`Could not decrypt ${what}: ${(e as Error)?.message || e}`);
      return null;
    }
  }

  hash(value: string): string {
    return crypto.createHmac('sha256', this.pepper).update(String(value)).digest('hex');
  }
}
