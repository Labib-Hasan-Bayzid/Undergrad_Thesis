import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('saved_cards')
export class CardEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'varchar', length: 160 })
  holderName: string;

  @Column({ type: 'varchar', length: 4 })
  last4: string;

  @Column({ type: 'varchar', length: 2 })
  expMonth: string;

  @Column({ type: 'varchar', length: 4 })
  expYear: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  billingAddress: string | null;

  @Column({ type: 'varchar', length: 40, default: 'pending_model' })
  status: string;

  @Column({ type: 'text', nullable: true })
  pendingTxtPath: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  modelFileId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}