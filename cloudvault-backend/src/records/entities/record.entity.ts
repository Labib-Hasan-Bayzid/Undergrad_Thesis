import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, Index,
} from 'typeorm';
import { RecordFile } from './record-file.entity';

@Entity('records')
@Index(['ownerUserId', 'recordName'], { unique: true })
export class RecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'varchar', length: 150 })
  recordName: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  bankName?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  accountHolderName?: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  accountNumber?: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  routingNumber?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  bankModelFileId?: string | null;

  @Column({ type: 'varchar', length: 40, default: 'pending_model' })
  bankStorageStatus: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => RecordFile, (f) => f.record)
  files: RecordFile[];
}