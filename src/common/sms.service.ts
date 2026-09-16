import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface OutboxMessage {
  id: string;
  to: string;
  message: string;
  kind: 'responder' | 'survivor' | 'system';
  at: string;
  mode: 'console' | 'sandbox' | 'live';
  status: string;
  /** Africa's Talking message id, used to match delivery reports. */
  messageId?: string;
  cost?: string;
  failureReason?: string;
  providerResponse?: unknown;
}

/**
 * Outbound SMS through Africa's Talking. Without AT credentials every message is
 * logged to the console and kept in an in-memory outbox that the simulator page
 * displays, so the whole flow can be demonstrated offline.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  readonly outbox: OutboxMessage[] = [];

  get mode(): 'console' | 'sandbox' | 'live' {
    if (!process.env.AT_API_KEY) return 'console';
    return (process.env.AT_USERNAME || 'sandbox') === 'sandbox' ? 'sandbox' : 'live';
  }

  async send(to: string, message: string, kind: OutboxMessage['kind'] = 'system'): Promise<OutboxMessage> {
    const entry: OutboxMessage = { id: randomUUID(), to, message, kind, at: new Date().toISOString(), mode: this.mode, status: 'queued' };
    this.outbox.unshift(entry);
    if (this.outbox.length > 300) this.outbox.pop();

    if (this.mode === 'console') {
      entry.status = 'logged';
      this.logger.log(`[SMS -> ${to}] ${message.replace(/\n/g, ' | ')}`);
      return entry;
    }
    const username = process.env.AT_USERNAME || 'sandbox';
    const base = username === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
    try {
      const body = new URLSearchParams({ username, to, message });
      if (process.env.AT_SENDER_ID) body.set('from', process.env.AT_SENDER_ID);
      const res = await fetch(`${base}/version1/messaging`, {
        method: 'POST',
        headers: { apiKey: process.env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const data: any = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
      entry.providerResponse = data;
      // A 201 only means the request was accepted; each recipient carries its own outcome.
      const r = data?.SMSMessageData?.Recipients?.[0];
      if (res.ok && r && [100, 101, 102].includes(Number(r.statusCode))) {
        entry.status = 'sent';
        entry.messageId = r.messageId;
        entry.cost = r.cost;
      } else {
        entry.status = 'failed';
        entry.failureReason = r?.status || data?.SMSMessageData?.Message || `HTTP ${res.status}`;
        this.logger.error(`SMS to ${to} not accepted by Africa's Talking: ${entry.failureReason}`);
      }
    } catch (e) {
      entry.status = 'failed';
      entry.failureReason = String((e as Error)?.message || e);
      this.logger.error(`SMS send failed: ${entry.failureReason}`);
    }
    return entry;
  }

  /** Delivery report from Africa's Talking: POST { id, status, phoneNumber, failureReason, ... }. */
  markDelivery(report: Record<string, string>): boolean {
    const entry = this.outbox.find((m) => m.messageId && m.messageId === report.id);
    if (!entry) return false;
    entry.status = String(report.status || entry.status).toLowerCase();
    if (report.failureReason) entry.failureReason = report.failureReason;
    if (entry.status !== 'success') this.logger.warn(`SMS ${report.id} to ${entry.to}: ${report.status}${report.failureReason ? ` (${report.failureReason})` : ''}`);
    return true;
  }
}
