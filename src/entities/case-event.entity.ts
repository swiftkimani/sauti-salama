import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Case } from './case.entity';

/** Append-only audit trail for a case: who did what, when. Erasing a case erases its trail. */
@Entity({ name: 'case_events' })
export class CaseEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index('IDX_case_events_caseId') @Column({ type: 'uuid' }) caseId: string;
  @ManyToOne(() => Case, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'caseId' })
  case: Case;
  @Column({ type: 'varchar' }) type: string;
  @Column({ type: 'varchar', nullable: true }) actor: string;
  @Column({ type: 'text', nullable: true }) detail: string;
  @CreateDateColumn() createdAt: Date;
}
