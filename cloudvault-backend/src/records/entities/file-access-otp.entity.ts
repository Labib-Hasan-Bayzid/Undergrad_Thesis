import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type OtpPurpose = 'FILE_VIEW' | 'FILE_DOWNLOAD' | 'BANK_VIEW';

@Entity('file_access_otps')
@Index(['ownerUserId', 'purpose', 'targetId'])
export class FileAccessOtp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  // fileId for files, recordId for bank (or recordId for anything “record scoped”)
  @Column({ type: 'uuid' })
  targetId: string;

  @Column({ type: 'varchar', length: 30 })
  purpose: OtpPurpose;

  @Column()
  otpHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
