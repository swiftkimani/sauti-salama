import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

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
    if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
      this.key = Buffer.from(hex, 'hex');
    } else {
      this.key = crypto.createHash('sha256').update('sauti-salama-dev-only-key').digest();
      this.logger.warn('ENCRYPTION_KEY is not set: using a DEV key. Run `npm run keygen` and set it before any real use.');
    }
    this.pepper = process.env.HASH_PEPPER || 'sauti-salama-dev-pepper';
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
    if (v !== 'v1') throw new Error('Unknown ciphertext version');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }

  hash(value: string): string {
    return crypto.createHmac('sha256', this.pepper).update(String(value)).digest('hex');
  }
}
