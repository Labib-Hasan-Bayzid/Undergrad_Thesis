import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { RecordEntity } from './record.entity';

export type FileCategory =
  | 'DEED'
  | 'MUTATION'
  | 'TAX'
  | 'MORTGAGE'
  | 'NID'
  | 'EVIDENCE';

@Entity('record_files')
@Index(['ownerUserId', 'recordId'])
export class RecordFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'uuid' })
  recordId: string;

  @ManyToOne(() => RecordEntity, (r) => r.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recordId' })
  record: RecordEntity;

  @Column({ type: 'varchar', length: 20 })
  category: FileCategory;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType: string;

  @Column({ type: 'bigint' })
  sizeBytes: string;

  @Column({ type: 'bytea', select: false, nullable: true })
  ciphertext?: Buffer | null;

  @Column({ type: 'jsonb', nullable: true })
  cryptoMeta?: any;

  @Column({ type: 'varchar', length: 120, nullable: true })
  modelFileId?: string | null;

  @Column({ type: 'varchar', length: 40, default: 'pending_model' })
  storageStatus: string;

  @Column({ type: 'text', nullable: true })
  pendingLocalPath?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}