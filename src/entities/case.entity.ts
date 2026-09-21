import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { NextStep, TriageResult } from '../ai/triage.types';
import { Responder } from './responder.entity';

export type CaseStatus = 'PROCESSING' | 'OPEN' | 'ACKNOWLEDGED' | 'ESCALATED' | 'RESOLVED' | 'FALSE_ALARM';

/**
 * One report. Everything that could identify the survivor (phone, narrative,
 * recording URL) is stored encrypted (AES-256-GCM) and only decrypted on an
 * audited action. Location is kept at ward/estate level, never GPS by default.
 */
@Entity({ name: 'cases' })
@Index('IDX_cases_status_escalateAt', ['status', 'escalateAt'])
export class Case {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', unique: true }) ref: string;
  @Column({ type: 'varchar' }) channel: string; // voice | voice_silent | ussd | ussd_silent | sms
  @Column({ type: 'varchar', default: 'en' }) language: string;
  @Column({ type: 'text', nullable: true }) phoneEnc: string;
  @Index('IDX_cases_phoneHash') @Column({ type: 'varchar', nullable: true }) phoneHash: string;
  @Column({ type: 'varchar', nullable: true }) phoneMasked: string;
  @Column({ type: 'boolean', default: false }) safeToContact: boolean;
  /** The survivor asked for help reporting to the police. Never assumed; set only by the survivor. */
  @Column({ type: 'boolean', default: false }) consentSharePolice: boolean;
  @Column({ type: 'varchar', nullable: true }) ward: string;
  @Column({ type: 'text', nullable: true }) narrativeEnc: string;
  @Column({ type: 'text', nullable: true }) recordingUrlEnc: string;
  @Column({ type: 'json', nullable: true }) triage: TriageResult;
  @Column({ type: 'json', nullable: true }) pathway: NextStep[];
  @Column({ type: 'varchar', default: 'medium' }) urgency: string;
  @Column({ type: 'varchar', default: 'OPEN' }) status: CaseStatus;
  /** Display name of whoever accepted the case (a console user types their own name). */
  @Column({ type: 'varchar', nullable: true }) acknowledgedBy: string;
  /** Set when a registered responder accepted the case (by SMS), so the audit points at a vetted person. */
  @ManyToOne(() => Responder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'acknowledgedById' })
  acknowledgedByResponder: Responder;
  /** When a responder first accepted the case: the time-to-accept metric. */
  @Column({ nullable: true }) acknowledgedAt: Date;
  /**
   * When the case goes to Tier 2 if nobody has accepted it. Stored rather than held in a timer so a restart,
   * a crash or a failed send can never leave an open case without escalation. Null when nothing is pending.
   */
  @Column({ nullable: true }) escalateAt: Date;
  @Column({ type: 'varchar', nullable: true }) callbackWindow: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
