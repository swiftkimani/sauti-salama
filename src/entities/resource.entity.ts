import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Verified support-directory entry (the "pull" side: trusted, actionable information). */
@Entity({ name: 'resources' })
export class Resource {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) category: string; // helpline|counselling|child|emergency|medical|police|legal|shelter
  @Column({ type: 'varchar' }) name: string;
  @Column({ type: 'varchar', default: 'national' }) coverage: string;
  @Column({ type: 'varchar', nullable: true }) phone: string;
  @Column({ type: 'varchar', nullable: true }) hours: string;
  @Column({ type: 'boolean', default: true }) free: boolean;
  @Column({ type: 'text', nullable: true }) noteEn: string;
  @Column({ type: 'text', nullable: true }) noteSw: string;
  @Column({ type: 'boolean', default: false }) verified: boolean;
  @Column({ type: 'varchar', nullable: true }) source: string;
}
