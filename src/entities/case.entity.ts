import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { NextStep, TriageResult } from '../ai/triage.types';

export type CaseStatus = 'PROCESSING' | 'OPEN' | 'ACKNOWLEDGED' | 'ESCALATED' | 'RESOLVED' | 'FALSE_ALARM';

/**
 * One report. Everything that could identify the survivor (phone, narrative,
 * recording URL) is stored encrypted (AES-256-GCM) and only decrypted on an
 * audited action. Location is kept at ward/estate level, never GPS by default.
 */
@Entity({ name: 'cases' })
export class Case {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', unique: true }) ref: string;
  @Column({ type: 'varchar' }) channel: string; // voice | voice_silent | ussd | ussd_silent | sms
  @Column({ type: 'varchar', default: 'en' }) language: string;
  @Column({ type: 'text', nullable: true }) phoneEnc: string;
  @Column({ type: 'varchar', nullable: true }) phoneHash: string;
  @Column({ type: 'varchar', nullable: true }) phoneMasked: string;
  @Column({ type: 'boolean', default: false }) safeToContact: boolean;
  @Column({ type: 'boolean', default: false }) consentSharePolice: boolean;
  @Column({ type: 'varchar', nullable: true }) ward: string;
  @Column({ type: 'text', nullable: true }) narrativeEnc: string;
  @Column({ type: 'text', nullable: true }) recordingUrlEnc: string;
  @Column({ type: 'simple-json', nullable: true }) triage: TriageResult;
  @Column({ type: 'simple-json', nullable: true }) pathway: NextStep[];
  @Column({ type: 'varchar', default: 'medium' }) urgency: string;
  @Column({ type: 'varchar', default: 'OPEN' }) status: CaseStatus;
  @Column({ type: 'varchar', nullable: true }) acknowledgedBy: string;
  /** When a responder first accepted the case: the time-to-accept metric. */
  @Column({ nullable: true }) acknowledgedAt: Date;
  @Column({ type: 'varchar', nullable: true }) callbackWindow: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
