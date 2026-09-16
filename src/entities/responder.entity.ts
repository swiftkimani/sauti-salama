import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** A vetted responder. Tier 1 = community (CHPs, peace committees, shelters' outreach); Tier 2 = institutional desk. */
@Entity({ name: 'responders' })
export class Responder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) name: string;
  @Column({ type: 'varchar' }) organisation: string;
  @Column({ type: 'varchar' }) phone: string;
  @Column({ type: 'integer', default: 1 }) tier: number;
  @Column({ type: 'simple-array' }) wards: string[]; // '*' = fallback for any ward
  @Column({ type: 'simple-array' }) languages: string[];
  @Column({ type: 'varchar', nullable: true }) verifiedBy: string;
  @Column({ type: 'boolean', default: true }) active: boolean;
}
