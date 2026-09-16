import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Append-only audit trail for a case: who did what, when. */
@Entity({ name: 'case_events' })
export class CaseEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) caseId: string;
  @Column({ type: 'varchar' }) type: string;
  @Column({ type: 'varchar', nullable: true }) actor: string;
  @Column({ type: 'text', nullable: true }) detail: string;
  @CreateDateColumn() createdAt: Date;
}
