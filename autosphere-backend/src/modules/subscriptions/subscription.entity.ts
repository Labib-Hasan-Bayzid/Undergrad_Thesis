import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type SubscriptionPlan = 'standard' | 'premium';

@Entity('subscriptions')
@Index(['vaultUserId'], { unique: true })
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // CloudVault user id (from JWT sub)
  @Column({ type: 'uuid' })
  vaultUserId: string;

  @Column({ type: 'varchar', length: 16 })
  plan: SubscriptionPlan;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  // last successful payment order (optional but helpful)
  @Column({ type: 'uuid', nullable: true })
  lastOrderId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'varchar', length: 180, nullable: true })
vaultEmail: string | null;
}